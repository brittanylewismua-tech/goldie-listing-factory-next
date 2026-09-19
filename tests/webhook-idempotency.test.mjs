import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/*
  A D1 stand-in that behaves the way the real one does where it matters:
  INSERT OR IGNORE reports how many rows it actually changed, and batch()
  applies all its statements or none.
*/
const latency = () => new Promise(resolve => setTimeout(resolve, 2));

function billingDb() {
  const tables = { stripe_events: new Map(), trial_reminder_emails: new Map(),
    billing_customers: new Map(), billing_subscriptions: new Map(),
    account_plans: new Map(), billing_trials: new Map() };
  const applied = [];

  const statement = (sql, values) => ({
    sql, values,
    apply() {
      applied.push(sql.slice(0, 60));
      const insertIgnore = /^INSERT OR IGNORE INTO (\w+)/i.exec(sql);
      if (insertIgnore) {
        const table = tables[insertIgnore[1]];
        const key = String(values[0]);
        if (table.has(key)) return { meta: { changes: 0 } };
        table.set(key, values);
        return { meta: { changes: 1 } };
      }
      const insert = /^INSERT INTO (\w+)/i.exec(sql);
      if (insert) { tables[insert[1]].set(String(values[0]), values); return { meta: { changes: 1 } }; }
      const remove = /^DELETE FROM (\w+)/i.exec(sql);
      if (remove) {
        const had = tables[remove[1]].delete(String(values[0]));
        return { meta: { changes: had ? 1 : 0 } };
      }
      const update = /^UPDATE (\w+)/i.exec(sql);
      if (update) return { meta: { changes: 1 } };
      return { meta: { changes: 0 } };
    },
    async run() { await latency(); return this.apply(); },
    async first() {
      await latency();
      const select = /FROM (\w+)/i.exec(sql);
      const table = select && tables[select[1]];
      if (!table) return null;
      const row = table.get(String(values[0]));
      if (!row) return null;
      if (select[1] === 'stripe_events') return { event_id: row[0] };
      if (select[1] === 'trial_reminder_emails') return { resend_email_id: row[2] };
      if (select[1] === 'billing_customers') return { email: 'member@example.com' };
      return { };
    },
  });

  return {
    tables, applied,
    prepare: sql => ({ bind: (...values) => statement(sql, values) }),
    async batch(statements) { await latency(); return statements.map(one => one.apply()); },
  };
}

// Run the real webhook route with its infrastructure replaced, so the logic
// under test is the deployed logic.
async function webhook({ db, onEmail }) {
  const source = readFileSync(new URL('../app/api/billing/webhook/route.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replace(/^export \{[^}]*\} from ["'][^"']+["'];?$/gm, '');
  globalThis.__db = db;
  globalThis.__onEmail = onEmail;
  const preamble = `
    const NextResponse={json:(body,init)=>Response.json(body,init)};
    const withErrorLog=(area,handler)=>handler;
    const logError=async()=>{};
    const billingRuntime=()=>({STRIPE_WEBHOOK_SECRET:'whsec_test',DB:globalThis.__db});
    const ensureBillingTables=async()=>{};
    const isCurrentPrice=()=>true;
    const planForPrice=()=>'pro';
    const stripeRequest=async()=>({unit_amount:4700,currency:'usd',recurring:{interval:'month'}});
    const scheduleTrialReminder=async(...args)=>globalThis.__onEmail(...args);
    const cancelTrialReminder=async()=>{};
  `;
  return import('data:text/javascript;base64,'
    + Buffer.from(preamble + compiled).toString('base64'));
}

const trialEvent = (id = 'evt_1') => ({
  id, type: 'customer.subscription.created',
  data: { object: {
    id: 'sub_1', status: 'trialing', customer: 'cus_1',
    trial_end: Math.floor(Date.now() / 1000) + 14 * 86400,
    metadata: { user_id: 'member-1', plan_key: 'pro' },
    items: { data: [{ price: { id: 'price_1', unit_amount: 4700, currency: 'usd',
      recurring: { interval: 'month' } } }] },
  } },
});

/* A real Stripe-style signature, so the route's own HMAC check is exercised. */
async function signed(event) {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_test'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { payload, header: `t=${timestamp},v1=${hex}` };
}

const deliver = async (route, event) => {
  const { payload, header } = await signed(event);
  return route.POST(new Request('https://example.com/api/billing/webhook', {
    method: 'POST', headers: { 'stripe-signature': header }, body: payload,
  }));
};

test('a webhook delivered twice in sequence has its effects once', async () => {
  const db = billingDb();
  const emails = [];
  const route = await webhook({ db, onEmail: async () => { emails.push(1); return 'resend_1'; } });

  const first = await deliver(route, trialEvent());
  assert.equal(first.status, 200);
  const second = await deliver(route, trialEvent());
  assert.equal((await second.json()).duplicate, true);

  assert.equal(emails.length, 1, 'the member was emailed twice');
  assert.equal(db.tables.stripe_events.size, 1);
});

test('a webhook delivered twice AT ONCE still has its effects exactly once', async () => {
  const db = billingDb();
  const emails = [];
  const route = await webhook({
    db,
    // A real provider call takes time. The overlap is the point of the test.
    onEmail: async () => { await new Promise(resolve => setTimeout(resolve, 5)); emails.push(1); return 'resend_1'; },
  });

  // Stripe retries on timeout without knowing the first delivery is still in
  // flight, so both arrive before either has finished.
  const [one, two] = await Promise.all([
    deliver(route, trialEvent()),
    deliver(route, trialEvent()),
  ]);
  const bodies = [await one.json(), await two.json()];

  assert.equal(emails.length, 1,
    `concurrent duplicate delivery sent ${emails.length} emails to the member`);
  assert.equal(bodies.filter(body => body.duplicate).length, 1,
    'neither delivery was recognised as the duplicate');
  assert.equal(db.tables.stripe_events.size, 1);
  // Exactly one reminder row, so exactly one Resend id is cancellable later.
  assert.equal(db.tables.trial_reminder_emails.size, 1,
    'an uncancellable reminder was left behind');
});

test('three at once is still one effect', async () => {
  const db = billingDb();
  const emails = [];
  const route = await webhook({
    db,
    onEmail: async () => { await new Promise(resolve => setTimeout(resolve, 5)); emails.push(1); return 'resend_1'; },
  });
  const results = await Promise.all([1, 2, 3].map(() => deliver(route, trialEvent())));
  const bodies = await Promise.all(results.map(one => one.json()));
  assert.equal(emails.length, 1, `${emails.length} emails were sent`);
  assert.equal(bodies.filter(body => body.duplicate).length, 2);
});

test('two DIFFERENT events are both processed', async () => {
  const db = billingDb();
  const emails = [];
  const route = await webhook({ db, onEmail: async () => { emails.push(1); return 'resend_1'; } });
  await deliver(route, trialEvent('evt_1'));
  const second = await deliver(route, trialEvent('evt_2'));
  assert.notEqual((await second.json()).duplicate, true,
    'a distinct event was mistaken for a duplicate');
  assert.equal(db.tables.stripe_events.size, 2);
});

test('an event whose access changes fail is released, so Stripe can retry it', async () => {
  const db = billingDb();
  let attempts = 0;
  const realBatch = db.batch.bind(db);
  db.batch = async statements => {
    attempts += 1;
    if (attempts === 1) throw new Error('D1_ERROR: database is locked');
    return realBatch(statements);
  };
  const route = await webhook({ db, onEmail: async () => 'resend_1' });

  await assert.rejects(() => deliver(route, trialEvent()), /database is locked/);
  assert.equal(db.tables.stripe_events.size, 0,
    'a failed event stayed claimed, so its retry would be turned away as a duplicate');

  // The retry must be treated as new work.
  const retry = await deliver(route, trialEvent());
  assert.notEqual((await retry.json()).duplicate, true,
    'the retry was ignored, so the entitlement change never happened');
  assert.equal(db.tables.stripe_events.size, 1);
});

test('a failing trial reminder does not un-claim the event, because billing succeeded', async () => {
  // The reminder is logged and not retried by design: the member's access is
  // already correct, and replaying the whole billing event to retry an email
  // would risk applying the entitlement change twice.
  const db = billingDb();
  const route = await webhook({ db, onEmail: async () => { throw new Error('Resend is down'); } });
  const response = await deliver(route, trialEvent());
  assert.equal(response.status, 200);
  assert.equal(db.tables.stripe_events.size, 1,
    'a failed email discarded a billing event that had already been applied');
});

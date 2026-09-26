/** Normalize a paid Etsy transaction without inventing its sale date. */
export function etsySaleValues(receipt:Record<string,unknown>,line:Record<string,unknown>,now:number){
  const paid=receipt.is_paid ?? receipt.was_paid;
  if(paid===false||receipt.is_canceled===true||/^(canceled|cancelled)$/i.test(String(receipt.status??'')))return null;
  const soldAt=[line.paid_timestamp,line.create_timestamp,line.created_timestamp,receipt.create_timestamp,receipt.created_timestamp]
    .map(Number).find(value=>Number.isFinite(value)&&value>0&&value<=now);
  const price=(line.price??{}) as Record<string,unknown>;
  const amount=Number(price.amount),divisor=Number(price.divisor??100),quantity=Number(line.quantity);
  if(!soldAt||!Number.isFinite(amount)||amount<0||!Number.isFinite(divisor)||divisor<=0||!Number.isInteger(quantity)||quantity<=0)return null;
  return {soldAt,priceMinor:Math.round(amount*100/divisor),quantity,currency:String(price.currency_code??'USD')};
}

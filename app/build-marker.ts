/* D479 - three times now a fix has been described as live when it was still
   sitting on GitHub, and the only way to tell was to guess from behaviour or
   go hunting for a CSS class in the built stylesheet. This string is bumped
   with every deployable commit and served from /api/version, so "is my fix
   actually live" is one request with a yes or no answer. */
export const BUILD_MARKER = "D557";

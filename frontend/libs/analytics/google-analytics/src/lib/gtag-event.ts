// publik's build sends no telemetry. The function stays so old call sites compile; it does
// nothing.
export const gtagEvent = function(
  _eventName: string,
  _args?: { [key: string]: string },
) {
  // No-op.
};

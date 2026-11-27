// Historical synthetic behavior contract; never packaged or used by the workspace.
// Synthetic session contracts. Production requires document identity and durable attempt IDs.
export function immutable(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
export function attemptIdentity(review) {
  if (!review) return null;
  const {campaign, id, code, generation, email, product, reward, terms} = review;
  return {campaign, id, code, generation, email, product, reward, terms};
}
export function matchesAttempt(review, attempt) {
  return !!(review && attempt && ['campaign','id','code','generation','email','product','reward','terms'].every(key =>
    Object.hasOwn(attempt,key) && review[key] === attempt[key]));
}

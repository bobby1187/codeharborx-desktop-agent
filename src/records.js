const REMOVABLE = new Set(['projects', 'agents', 'workflows', 'knowledge', 'assets', 'deployments', 'team']);
function removeRecord(data, collection, id) {
  if (!REMOVABLE.has(collection) || typeof id !== 'string' || !id) throw new Error('Invalid record.');
  if (collection === 'team' && id === 'owner') throw new Error('The owner record must be kept.');
  const records = data[collection];
  if (!Array.isArray(records)) throw new Error('Record not found.');
  const record = records.find(item => item.id === id);
  if (!record) throw new Error('Record not found.');
  return { record, data: { ...data, [collection]: records.filter(item => item.id !== id) } };
}
module.exports = { removeRecord };

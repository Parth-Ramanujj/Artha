// Browser storage keys were renamed from `openwa…` to `artha…`. Copy each old value to its new key once,
// so an upgrade keeps users logged in and keeps data the dashboard stores locally (sales pipeline deals,
// team members, AI credits, theme, language…). An existing new key always wins; old keys are left in place.
export function migrateLegacyStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>): void {
  const oldKeys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && /^openwa[._]/.test(key)) oldKeys.push(key);
  }
  for (const oldKey of oldKeys) {
    const newKey = `artha${oldKey.slice('openwa'.length)}`;
    const value = storage.getItem(oldKey);
    if (value !== null && storage.getItem(newKey) === null) storage.setItem(newKey, value);
  }
}

for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
  try {
    if (storage) migrateLegacyStorage(storage);
  } catch {
    // storage blocked (private mode / sandboxed frame): nothing to migrate
  }
}

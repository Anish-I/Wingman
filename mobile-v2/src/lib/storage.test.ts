describe('web storage hardening', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
  });

  it('creates web MMKV with a per-session encryption key', async () => {
    const createMMKV = jest.fn(() => ({
      getString: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    }));
    const secureStore = {
      getItemAsync: jest.fn(),
      setItemAsync: jest.fn(),
    };
    const getRandomValues = jest.fn((bytes: Uint8Array) => {
      bytes.fill(0xab);
      return bytes;
    });

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('react-native-mmkv', () => ({
      createMMKV,
    }));
    jest.doMock('expo-secure-store', () => secureStore);

    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues },
      configurable: true,
    });

    const { initStorage, getStorage } = await import('./storage');

    await initStorage();

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(createMMKV).toHaveBeenCalledWith({
      id: 'wingman-storage',
      encryptionKey: 'ab'.repeat(32),
    });
    expect(secureStore.getItemAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).not.toHaveBeenCalled();
    expect(getStorage()).toBe(createMMKV.mock.results[0]?.value);
  });
});

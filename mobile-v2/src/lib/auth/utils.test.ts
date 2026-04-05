describe('web auth token storage', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('keeps JWTs in memory on web instead of SecureStore', async () => {
    const secureStore = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      deleteItemAsync: jest.fn(() => Promise.resolve()),
    };

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('expo-secure-store', () => secureStore);

    const { getToken, setToken, removeToken } = await import('./utils');

    expect(getToken()).toBeNull();

    setToken('header.payload.signature');

    expect(getToken()).toBe('header.payload.signature');
    expect(secureStore.getItem).not.toHaveBeenCalled();
    expect(secureStore.setItem).not.toHaveBeenCalled();

    removeToken();

    expect(getToken()).toBeNull();
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

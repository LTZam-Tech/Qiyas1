describe('Backend smoke tests', () => {
  it('runs Jest successfully', () => {
    expect(true).toBe(true);
  });

  it('loads compiled config module when available', () => {
    let config;

    expect(() => {
      config = require('./dist/config');
    }).not.toThrow();

    expect(config).toBeDefined();
  });
});

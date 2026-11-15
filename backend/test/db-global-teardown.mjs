export default async function teardown() {
  const pg = globalThis.__QIYAS_TEST_PG__;
  if (pg) await pg.stop();
}

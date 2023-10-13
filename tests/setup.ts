// ts-unused-exports:disable-next-line
export default (): void => {
  process.env.BITCOIN_RPC_USERNAME = 'test';
  process.env.BITCOIN_RPC_PASSWORD = 'password';
  process.env.ORDHOOK_WORKING_DIR = '/tmp';
  process.env.PGDATABASE = 'postgres';
  // TODO: Remove these obsolete values
  process.env.CHAINHOOK_NODE_AUTH_TOKEN = 'test';
  process.env.CHAINHOOK_NODE_RPC_HOST = 'test.chainhooks.com';
};

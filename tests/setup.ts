// ts-unused-exports:disable-next-line
export default (): void => {
  process.env.ORDHOOK_NODE_AUTH_TOKEN = 'test';
  process.env.ORDHOOK_NODE_RPC_HOST = 'test.chainhooks.com';
  process.env.ORDHOOK_NODE_RPC_PORT = '13370';
  process.env.PGDATABASE = 'postgres';
};

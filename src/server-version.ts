import { readFileSync } from 'fs';

interface ServerVersion {
  branch: string;
  commit: string;
  tag: string;
}

function getServerVersion(): ServerVersion {
  if (process.env.NODE_ENV === 'test') {
    return {
      branch: 'test',
      commit: '123456',
      tag: 'v0.0.1',
    };
  }
  const [branch, commit, tag] = readFileSync('.git-info', 'utf-8').split('\n');
  return { branch, commit, tag };
}

export const SERVER_VERSION = getServerVersion();

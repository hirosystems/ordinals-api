/**
 * Checks if a given error from the pg lib is a connection error (i.e. the query is retryable).
 * If true then returns a normalized error message, otherwise returns false.
 */
export function isPgConnectionError(error: any): string | false {
  if (error.code === 'ECONNREFUSED') {
    return 'Postgres connection ECONNREFUSED';
  } else if (error.code === 'ETIMEDOUT') {
    return 'Postgres connection ETIMEDOUT';
  } else if (error.code === 'ENOTFOUND') {
    return 'Postgres connection ENOTFOUND';
  } else if (error.code === 'ECONNRESET') {
    return 'Postgres connection ECONNRESET';
  } else if (error.code === 'CONNECTION_CLOSED') {
    return 'Postgres connection CONNECTION_CLOSED';
  } else if (error.code === 'CONNECTION_ENDED') {
    return 'Postgres connection CONNECTION_ENDED';
  } else if (error.code === 'CONNECTION_DESTROYED') {
    return 'Postgres connection CONNECTION_DESTROYED';
  } else if (error.code === 'CONNECTION_CONNECT_TIMEOUT') {
    return 'Postgres connection CONNECTION_CONNECT_TIMEOUT';
  } else if (error.code === 'CONNECT_TIMEOUT') {
    return 'Postgres connection CONNECT_TIMEOUT';
  } else if (error.message) {
    const msg = (error as Error).message.toLowerCase();
    if (msg.includes('database system is starting up')) {
      return 'Postgres connection failed while database system is starting up';
    } else if (msg.includes('database system is shutting down')) {
      return 'Postgres connection failed while database system is shutting down';
    } else if (msg.includes('connection terminated unexpectedly')) {
      return 'Postgres connection terminated unexpectedly';
    } else if (msg.includes('connection terminated')) {
      return 'Postgres connection terminated';
    } else if (msg.includes('connection error')) {
      return 'Postgres client has encountered a connection error and is not queryable';
    } else if (msg.includes('terminating connection due to unexpected postmaster exit')) {
      return 'Postgres connection terminating due to unexpected postmaster exit';
    } else if (msg.includes('getaddrinfo eai_again')) {
      return 'Postgres connection failed due to a DNS lookup error';
    } else if (msg.includes('terminating connection due to administrator command')) {
      return 'Postgres connection closed due to administrator command';
    } else if (msg.includes('password authentication failed')) {
      return 'Postgres authentication failed';
    }
  }
  return false;
}

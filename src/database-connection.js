const POOLS = {};

// Wrap a single connection w/ a query method in an async function.
// This is used when we need to execute multiple successive queries and make sure
// they're executed on the *same* connection and not separate connections
// from the connection pool.
export default class DatabaseConnection {
  constructor(pool, rawClient) {
    this.pool = pool;
    this.rawClient = rawClient;
  }

  static pool(connectionString) {
    // implement
  }

  static async connect(options) {
    // implement
  }

  query(...args) {
    // return new PostgresCursor(this, this.rawClient.query(...args));
  }

  close() {
    this.pool.release(this.rawClient);
    this.rawClient = null;
  }

  static async _connect(ConnectionClass, options) {
    return new Promise((resolve, reject) => {
      const pool = ConnectionClass.pool(options.db);

      pool.acquire((err, client) => {
        if (err) {
          return reject(err);
        }

        return resolve(new ConnectionClass(pool, client));
      });
    });
  }

  static _pool(createPool, connectionString) {
    let pool = POOLS[connectionString];

    if (pool == null) {
      const params = {
        db: connectionString,
        max: DatabaseConnection.maxConnections,
        idleTimeoutMillis: DatabaseConnection.idleTimeoutMillis,
        reapIntervalMillis: DatabaseConnection.reapIntervalMillis
      };

      pool = POOLS[connectionString] = createPool(params);
    }

    return pool;
  }

  static shutdown() {
    for (const connection of Object.keys(POOLS)) {
      const pool = POOLS[connection];

      if (pool) {
        pool.drain(() => {
          pool.destroyAllNow();
        });
      }
    }
  }
}

DatabaseConnection.maxConnections = null;
DatabaseConnection.idleTimeoutMillis = null;
DatabaseConnection.reapIntervalMillis = null;

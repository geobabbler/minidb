'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _postgresConnection = require('./postgres-connection');

var _postgresConnection2 = _interopRequireDefault(_postgresConnection);

var _pg = require('pg');

var _pg2 = _interopRequireDefault(_pg);

var _pgFormat = require('pg-format');

var _pgFormat2 = _interopRequireDefault(_pgFormat);

var _util = require('util');

var _esc = require('./esc');

var _esc2 = _interopRequireDefault(_esc);

var _database = require('./database');

var _database2 = _interopRequireDefault(_database);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Parse bigints as `Number` objects. If a caller *really* knows their
// number cannot fit in a JS Number, it can be casted to `text` in
// the query and parsed manually. Without this, dead simple COUNT(*)
// queries are returned as text and it makes doing simple things hard.
_pg2.default.types.setTypeParser(20, val => {
  return val == null ? null : parseInt(val, 10);
});

let minipg = null;

class Postgres extends _database2.default {
  constructor(options) {
    super(options);

    this.client = options.client;
  }

  static set driver(driver) {
    minipg = driver;
    _postgresConnection2.default.driver = driver;
  }

  ident(value) {
    return (0, _esc2.default)(value, '"');
  }

  static setNoticeProcessor(processor) {
    minipg.Client.defaultNoticeProcessor = processor;
  }

  static connect(db) {
    return _asyncToGenerator(function* () {
      return yield _postgresConnection2.default.connect(db);
    })();
  }

  static shutdown() {
    _postgresConnection2.default.shutdown();
  }

  get dialect() {
    return 'postgresql';
  }

  _each(sql, params, callback) {
    var _this = this;

    return _asyncToGenerator(function* () {
      _this.log(sql);

      let close = false;
      let client = _this.client;
      let cursor = null;

      if (client == null) {
        close = true;
        client = yield Postgres.connect(_this.options);
      }

      try {
        cursor = client.query(sql);

        while (cursor.hasRows) {
          const result = yield cursor.next();

          if (result && callback) {
            /* eslint-disable callback-return */
            yield callback({ columns: result.columns, values: result.values, index: result.index, cursor: cursor });
            /* eslint-enable callback-return */
          }
        }
      } catch (ex) {
        if (_this.verbose) {
          console.error('ERROR', ex);
        }

        throw ex;
      } finally {
        if (cursor) {
          try {
            yield cursor.close();
          } catch (err) {
            // Closing the cursor on a connection where there was a previous error rethrows the same error
            // This is because pumping the cursor to completion ends up carrying the original error to
            // the end. This is desired behavior, we just have to swallow any potential errors here.
          }
        }

        if (close) {
          yield client.close();
        }
      }
    })();
  }

  close() {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      if (_this2.client) {
        yield _this2.client.close();

        _this2.client = null;
      }
    })();
  }

  query(sql, params) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      _this3.log(sql);

      let client = _this3.client;

      if (client == null) {
        client = yield Postgres.connect(_this3.options.db);
      }

      return client.query(sql, params);
    })();
  }

  _execute(sql, params) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let resultColumns = null;
      const rows = [];

      yield _this4._each(sql, [], (() => {
        var _ref = _asyncToGenerator(function* (_ref2) {
          let columns = _ref2.columns,
              values = _ref2.values,
              index = _ref2.index,
              cursor = _ref2.cursor;

          if (resultColumns == null) {
            resultColumns = columns;
          }

          if (values) {
            rows.push(values);
          }
        });

        return function (_x) {
          return _ref.apply(this, arguments);
        };
      })());

      return { rows: rows, columns: resultColumns };
    })();
  }

  beginTransaction() {
    if (this.client == null) {
      throw new Error('client is null when beginning a transaction');
    }

    return this.execute('BEGIN TRANSACTION;');
  }

  commit() {
    if (this.client == null) {
      throw new Error('client is null when committing a transaction');
    }

    return this.execute('COMMIT TRANSACTION;');
  }

  rollback() {
    if (this.client == null) {
      throw new Error('client is null when rolling back a transaction');
    }

    return this.execute('ROLLBACK TRANSACTION;');
  }

  transaction(block) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      // get a connection from the pool and make sure it gets used throughout the
      // transaction block.
      const client = yield Postgres.connect(_this5.options);

      const db = new Postgres(Object.assign({}, _this5.options, { client: client }));

      yield db.beginTransaction();

      try {
        yield block(db);
        yield db.commit();
      } catch (ex) {
        try {
          yield db.rollback();
        } catch (rollbackError) {
          yield db.close();
          throw rollbackError;
        }

        throw ex;
      } finally {
        yield db.close();
      }
    })();
  }

  static transaction(options, block) {
    if (options instanceof Postgres) {
      return options.transaction(block);
    }

    return new Postgres(options).transaction(block);
  }

  static using(options, block) {
    return _asyncToGenerator(function* () {
      const connection = yield Postgres.connect(options);

      const db = new Postgres(Object.assign({}, options, { client: connection }));

      try {
        yield block(db);
      } finally {
        yield connection.close();
      }
    })();
  }

  arrayFormatString(array) {
    if (Number.isInteger(array[0])) {
      return 'ARRAY[%L]::bigint[]';
    } else if (typeof array[0] === 'number') {
      return 'ARRAY[%L]::double precision[]';
    }

    return 'ARRAY[%L]';
  }

  buildWhere(where) {
    const clause = [];

    if (where) {
      for (const key of Object.keys(where)) {
        const value = where[key];

        if (value == null) {
          clause.push((0, _pgFormat2.default)('%I IS NULL', key));
        } else if (Array.isArray(value)) {
          clause.push(value.length ? (0, _pgFormat2.default)('%I = ANY (' + this.arrayFormatString(where[key]) + ')', key, value) : (0, _pgFormat2.default)('%I = ANY (%L)', key, '{}'));
        } else {
          clause.push((0, _pgFormat2.default)('%I = %L', key, value));
        }
      }
    }

    return [clause, []];
  }

  buildInsert(attributes) {
    let includeNames = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

    const names = [];
    const values = [];
    const placeholders = [];

    // Use the literal values instead of placeholders  because parameterized
    // queries require prepared statements. Prepared statements are stateful
    // and impose requirements on the connection that are incompatible with
    // pgbouncer.
    for (const key of Object.keys(attributes)) {
      if (includeNames) {
        names.push((0, _pgFormat2.default)('%I', key));
      }

      const value = attributes[key];

      if (Array.isArray(value)) {
        placeholders.push(value.length ? (0, _pgFormat2.default)('ARRAY[%L]', value) : "'{}'");
      } else if (value && value.raw) {
        placeholders.push((0, _pgFormat2.default)('%s', value.raw));
      } else {
        placeholders.push((0, _pgFormat2.default)('%L', value));
      }
    }

    return [names, placeholders, values];
  }

  buildUpdate(attributes) {
    const sets = [];
    const values = [];

    for (const key of Object.keys(attributes)) {
      const value = attributes[key];

      if (Array.isArray(value)) {
        sets.push(value.length ? (0, _pgFormat2.default)('%I = ARRAY[%L]', key, value) : (0, _pgFormat2.default)('%I = %L', key, '{}'));
      } else if (value && value.raw) {
        sets.push((0, _pgFormat2.default)('%I = %s', value.raw));
      } else {
        sets.push((0, _pgFormat2.default)('%I = %L', key, value));
      }
    }

    return [sets, values];
  }

  insertStatement(table, attributes, options) {
    if (options == null || options.pk == null) {
      throw new Error('pk is required');
    }

    var _buildInsert = this.buildInsert(attributes),
        _buildInsert2 = _slicedToArray(_buildInsert, 3);

    const names = _buildInsert2[0],
          placeholders = _buildInsert2[1],
          values = _buildInsert2[2];


    const returning = options && options.returnPrimaryKey === false ? '' : ' RETURNING ' + options.pk;

    const sql = (0, _util.format)('INSERT INTO %s (%s)\nVALUES (%s)%s;', table, names.join(', '), placeholders.join(', '), returning);

    return { sql: sql, values: values };
  }

  insertStatements(table, arrayOfAttributes, options) {
    const arrayOfValues = [];

    let names = null;

    for (const attributes of arrayOfAttributes) {
      const insert = this.buildInsert(attributes, names == null);

      if (names == null) {
        names = insert[0];
      }

      arrayOfValues.push('(' + insert[1].join(', ') + ')');
    }

    const sql = (0, _util.format)('INSERT INTO %s (%s)\nVALUES %s;', table, names.join(', '), arrayOfValues.join(',\n'));

    return { sql: sql, values: {} };
  }

  insert(table, attributes, options) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      const statement = _this6.insertStatement(table, attributes, options);

      const result = yield _this6.all(statement.sql, statement.values);

      return +result[0].id;
    })();
  }

  toDatabase(value, column) {
    if (value == null) {
      return null;
    }

    switch (column.type) {
      case 'datetime':
        return value.toISOString();

      default:
        return super.toDatabase(value, column);
    }
  }

  fromDatabase(value, column) {
    if (value == null) {
      return null;
    }

    switch (column.type) {
      case 'datetime':
        return new Date(value);

      default:
        return super.fromDatabase(value, column);
    }
  }
}
exports.default = Postgres;
//# sourceMappingURL=postgres.js.map
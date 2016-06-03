'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _util = require('util');

var _mixmatch = require('mixmatch');

var _mixmatch2 = _interopRequireDefault(_mixmatch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

const models = [];

class PersistentObject extends _mixmatch2.default {
  constructor(db, attributes) {
    super();

    this.initializePersistentObject(db, attributes);
  }

  get db() {
    return this._db;
  }

  get rowID() {
    return this._rowID;
  }

  initializePersistentObject(db, attributes) {
    this._db = db;
    this.updateFromDatabaseAttributes(attributes || {});

    return this;
  }

  static findFirst(ModelClass, db, attributes) {
    return _asyncToGenerator(function* () {
      const row = yield db.findFirstByAttributes(ModelClass.tableName, null, attributes);

      if (row) {
        const instance = new ModelClass();

        instance.initializePersistentObject(db, row);

        return instance;
      }

      return null;
    })();
  }

  static findAll(ModelClass, db, attributes, orderBy) {
    return _asyncToGenerator(function* () {
      const rows = yield db.findAllByAttributes(ModelClass.tableName, null, attributes, orderBy);

      return rows.map(function (row) {
        const instance = new ModelClass();

        instance.initializePersistentObject(db, row);

        return instance;
      });
    })();
  }

  static findEach(ModelClass, db, options, callback) {
    return db.findEachByAttributes(_extends({ tableName: ModelClass.tableName }, options), (() => {
      var ref = _asyncToGenerator(function* (columns, row, index) {
        if (row) {
          const instance = new ModelClass();

          instance.initializePersistentObject(db, row);

          return yield callback(instance, index, row, columns);
        }

        return null;
      });

      return function (_x, _x2, _x3) {
        return ref.apply(this, arguments);
      };
    })());
  }

  static findOrCreate(ModelClass, db, attributes) {
    return _asyncToGenerator(function* () {
      const row = yield db.findFirstByAttributes(ModelClass.tableName, null, attributes);

      const instance = new ModelClass();

      instance.initializePersistentObject(db, row || attributes);

      return instance;
    })();
  }

  static create(ModelClass, db, attributes) {
    const instance = new ModelClass();

    instance.initializePersistentObject(db, attributes);

    return instance;
  }

  static count(ModelClass, db, attributes) {
    return _asyncToGenerator(function* () {
      const result = yield db.findFirstByAttributes(ModelClass.tableName, ['COUNT(1) AS count'], attributes);

      return result.count;
    })();
  }

  static get modelMethods() {
    return ['findFirst', 'findAll', 'findEach', 'findOrCreate', 'create', 'count'];
  }

  static get models() {
    return models.slice();
  }

  static register(modelClass) {
    models.push(modelClass);

    PersistentObject.includeInto(modelClass);

    const wrap = method => {
      return function () {
        for (var _len = arguments.length, params = Array(_len), _key = 0; _key < _len; _key++) {
          params[_key] = arguments[_key];
        }

        const args = [modelClass].concat(params);
        return PersistentObject[method].apply(PersistentObject, args);
      };
    };

    for (const method of PersistentObject.modelMethods) {
      modelClass[method] = wrap(method);
    }
  }

  updateFromDatabaseAttributes(attributes) {
    this._updateFromDatabaseAttributes(attributes);
  }

  _updateFromDatabaseAttributes(attributes) {
    for (const column of this.constructor.columns) {
      const name = '_' + column.name;
      const value = attributes[column.column];

      // if (value == null && column[2] && column[2].null === false) {
      //   console.warn(format('column %s cannot be null', name));
      // }

      this[name] = this.db.fromDatabase(value, column);
    }

    this._rowID = this.toNumber(attributes.id);
  }

  get databaseValues() {
    const values = {};

    for (const column of this.constructor.columns) {
      const name = column.name;
      const value = this['_' + name];

      if (value == null && column.null === false) {
        throw Error((0, _util.format)('column %s cannot be null', name));
      }

      values[column.column] = this.db.toDatabase(value, column);
    }

    return values;
  }

  get changes() {
    return this.databaseValues;
  }

  toNumber(integer) {
    return integer != null ? +integer : null;
  }

  updateTimestamps() {
    const now = new Date();

    if (!this.createdAt) {
      this.createdAt = now;
    }

    this.updatedAt = now;
  }

  get isPersisted() {
    return this.rowID > 0;
  }

  save(opts) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const options = opts || {};

      if (_this.beforeSave) {
        yield _this.beforeSave(options);
      }

      const values = _this.databaseValues;

      if (options.timestamps !== false) {
        _this.updateTimestamps();
      }

      values.created_at = _this.db.toDatabase(_this.createdAt, { type: 'datetime' });
      values.updated_at = _this.db.toDatabase(_this.updatedAt, { type: 'datetime' });

      if (!_this.isPersisted) {
        _this._rowID = yield _this.db.insert(_this.constructor.tableName, values, { pk: 'id' });
      } else {
        yield _this.db.update(_this.constructor.tableName, { id: _this.rowID }, values);
      }

      // It's not possible to override `async` methods currently (and be able to use `super`)
      if (_this.afterSave) {
        yield _this.afterSave(options);
      }

      return _this;
    })();
  }

  delete(opts) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      if (_this2.isPersisted) {
        yield _this2.db.delete(_this2.constructor.tableName, { id: _this2.rowID });

        _this2._rowID = null;
        _this2.createdAt = null;
        _this2.updatedAt = null;
      }

      return _this2;
    })();
  }

  loadOne(name, model, id) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const ivar = '_' + name;

      const pk = id || _this3[ivar + 'RowID'];

      if (pk == null) {
        return null;
      }

      if (_this3[ivar]) {
        return _this3[ivar];
      }

      const instance = yield model.findFirst(_this3.db, { id: pk });

      _this3.setOne(name, instance);

      return _this3[ivar];
    })();
  }

  setOne(name, instance) {
    const ivar = '_' + name;

    if (instance) {
      this[ivar] = instance;
      this[ivar + 'ID'] = instance.id;
      this[ivar + 'RowID'] = instance.rowID;
    } else {
      this[ivar] = null;
      this[ivar + 'ID'] = null;
      this[ivar + 'RowID'] = null;
    }
  }
}
exports.default = PersistentObject;
//# sourceMappingURL=persistent-object.js.map
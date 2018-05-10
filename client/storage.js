export default class StorageService {
  constructor(
    { dbName, version },
    indexedDB,
    IDBKeyRange,
    ApiService,
    TransformService,
    UtilsService
  ) {
    this.version = version;
    this.dbName = dbName;
    this._indexedDB = indexedDB;
    this._IDBKeyRange = IDBKeyRange;
    this._ApiService = ApiService;
    this._TransformService = TransformService;
    this._UtilsService = UtilsService;
  }

  init() {
    const DBOpenRequest = this._indexedDB.open(this.dbName, this.version);

    return new Promise(resolve => {
      DBOpenRequest.onerror = event => {
        throw new Error("Error loading database (opening)");
      };
      DBOpenRequest.onsuccess = event => {
        this._db = DBOpenRequest.result;
        this._transactoinsFactory = this._getTransactionsFactory(this._db);
        this._db.onclose = () => this.init();
        resolve(this);
      };
      DBOpenRequest.onupgradeneeded = event => {
        this._onupgradeneeded(event.target.result);
      };
    });
  }

  async getItemsIterator(objStoreName, lowerKey, upperKey, yScaleFactor, averageToLimit) {
    const tableEntries = await this._getTableEntries(
      objStoreName,
      lowerKey,
      upperKey
    );

    const transformPomises = this._UtilsService.getObjArray(
      tableEntries.length
    );
    const chunkSize = averageToLimit
      ? Math.ceil(tableEntries.length * 31 / averageToLimit)
      : 1;

    console.log(chunkSize, averageToLimit, tableEntries.length);

    for (let i = 0; i < tableEntries.length; i++) {
      transformPomises[i] = await this._TransformService.dbToCanvasFormat(
        tableEntries[i].value,
        yScaleFactor,
        chunkSize
      );
    }

    const iterator = function*() {
      for (let i = 0; i < tableEntries.length; i++) {
        for (let promise of transformPomises[i]()) {
          yield promise;
        }
      }
    };

    return iterator;
  }

  async _getTableEntries(objStoreName, lowerKey, upperKey) {
    const boundKeyRange =
      lowerKey && upperKey
        ? this._IDBKeyRange.bound(lowerKey, upperKey, false, false)
        : null;

    const count = await this.count(objStoreName, boundKeyRange);
    const result = this._UtilsService.getObjArray(count);

    const cursorHandlerFactory = (resolve, index) => event => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve(result);
        return;
      }
      result[index++] = { key: cursor.key, value: cursor.value };
      cursor.continue();
    };

    return new Promise(resolve => {
      let index = 0;
      const transaction = this._transactoinsFactory[objStoreName]();
      transaction.openCursor(boundKeyRange).onsuccess = cursorHandlerFactory(
        resolve,
        index
      );
    });
  }

  async sync(objStoreName, apiPath) {
    //todo: опустошать таблицу сначала
    const serverData = await this._ApiService.fetch(apiPath);
    const tableObjectIt = await this._TransformService.serverToDBFormat(
      serverData,
      1
    );

    const tableObject = tableObjectIt().next().value;
    const keys = Object.keys(tableObject);
    let transaction = null;

    for (let lastIndex = keys.length - 1, i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (i === lastIndex) {
        transaction.onsuccess = Promise.resolve;
      }

      transaction = this._transactoinsFactory[objStoreName]();
      transaction.add(tableObject[key], key);
    }

    return transaction.onsuccess;
  }

  async isSyncNeeded(objStoreName) {
    const count = await this.count(objStoreName);
    return count === 0;
  }

  count(objStoreName, query) {
    const transaction = this._transactoinsFactory[objStoreName]();
    const countRequest = transaction.count(query);
    return new Promise(resolve => {
      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };
    });
  }

  _getTransactionsFactory(db) {
    return Object.create(
      {},
      {
        ["temperature"]: {
          get: () => () =>
            db
              .transaction(["temperature"], "readwrite")
              .objectStore("temperature")
        },
        ["precipitation"]: {
          get: () => () =>
            db
              .transaction(["precipitation"], "readwrite")
              .objectStore("precipitation")
        }
      }
    );
  }

  _onupgradeneeded(db) {
    db.onerror = function(event) {
      throw new Error("Error loading database (upgrading)");
    };

    const tempObjStore = db.createObjectStore("temperature");
    const precObjStore = db.createObjectStore("precipitation");
  }
}

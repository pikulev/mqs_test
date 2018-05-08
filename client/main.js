"use strict";
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };

  class App {
    constructor(apiService, storageService, transformService) {
      console.log("app loaded");
      this._apiService = apiService;
      this._storageServicePromise = storageService.init();
      this._transformService = transformService;
    }

    async temperatureCtrl() {
      const TABLE_NAME = "temperature";
      const API_PATH = "temperature";
      const entires = await this._getEntriesIterator(TABLE_NAME, API_PATH);
      for (let entry of entires) {
        const e = await entry;
        console.log(e);
        // тут может быть undefined в e;
        const items = await this._transformService.dbToAppFormat([e]);
        for (let item of items()) {
          console.log(item);
        }
      }
    }

    async precipitationCtrl() {
      const TABLE_NAME = "precipitation";
      const API_PATH = "precipitation";
      const entires = await this._getEntriesIterator(TABLE_NAME, API_PATH);
      for (let entry of entires) {
        const e = await entry;
        const items = await this._transformService.dbToAppFormat([e]);
        for (let item of items()) {
          console.log(item);
        }
      }
    }

    async _getEntriesIterator(tableName, apiPath) {
      const storageService = await this._storageServicePromise;
      const isSyncNeeded = await storageService.isSyncNeeded(tableName);
      return isSyncNeeded
        ? await storageService.syncTable(tableName, apiPath)
        : await storageService.geTableIterator(tableName);
    }
  }

  class ApiService {
    constructor(apiUrl) {
      this._apiUrl = apiUrl;
    }

    async fetch(url) {
      try {
        const response = await fetch(`${this._apiUrl}/${url}`);
        return await response.json();
      } catch (err) {
        console.error(err);
      }
    }
  }

  // отсортировать все приватные/публичные
  class TransformService {
    constructor() {
      this._SERVER_TO_DB_WORKER_PATH = "/assets/workers/transform-to-db.js";
      this._DB_TO_APP_WORKER_PATH = "/assets/workers/transform-to-app.js";
    }

    async serverToDBFormat(serverData) {
      const iteratorFactory = data =>
        function*() {
          for (let key in data) {
            yield { key, value: data[key] };
          }
        };
      return await this._getResultIterator(
        serverData,
        this._SERVER_TO_DB_WORKER_PATH,
        iteratorFactory
      );
    }

    async dbToAppFormat(dbData) {
      const iteratorFactory = data =>
        function*() {
          for (let item of data) {
            yield item;
          }
        };
      return await this._getResultIterator(
        dbData,
        this._DB_TO_APP_WORKER_PATH,
        iteratorFactory
      );
    }

    _getResultIterator(data, workerPath, iteratorFactory) {
      const worker = new Worker(workerPath);
      worker.postMessage(data);

      return new Promise(resolve => {
        worker.onmessage = event => {
          if (!event.data) {
            throw new Error("serverToDBFormat error: result is empty");
          }
          console.log("worker message got");
          resolve(iteratorFactory(event.data));
        };
      });
    }
  }

  class StorageService {
    constructor(
      { dbName, version },
      indexedDB,
      IDBKeyRange,
      ApiService,
      TransformService
    ) {
      this.version = version;
      this.dbName = dbName;
      this._indexedDB = indexedDB;
      this._IDBKeyRange = IDBKeyRange;
      this._ApiService = ApiService;
      this._TransformService = TransformService;
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

    async geTableIterator(objStoreName, lowerKey, upperKey) {
      const transaction = this._transactoinsFactory[objStoreName]();
      const boundKeyRange =
        lowerKey && upperKey
          ? this._IDBKeyRange.bound(lowerKey, upperKey, false, false)
          : null;

      const openedCursor = transaction.openCursor(boundKeyRange);
      let continueCursor = new Function();
      const openedCursorPromiseFactory = () => {
        return new Promise(resolve => {
          openedCursor.onsuccess = event => {
            resolve(event.target.result);
            console.log(event.target.result, continueCursor);
          };
        }).then(cursor => {
          if (!cursor) {
            throw new Error("cursor end");
          }
          const dbEntry = { key: cursor.key, value: cursor.value };
          console.log("dbEntry", dbEntry);
          continueCursor = cursor.continue;
          return dbEntry;
        });
      };

      const iterator = function*(continueCursor) {
        let end = false;
        while (!end) {
          const entryPromise = openedCursorPromiseFactory().catch(err => {
            console.error(err);
            end = true;
          });
          yield entryPromise;
          console.log('continueCursor', continueCursor);
          continueCursor();
        }
      };

      return iterator(continueCursor);
    }

    async syncTable(objStoreName, apiPath) {
      //todo: опустошать таблицу сначала
      const serverData = await this._ApiService.fetch(apiPath);
      const iterator = await this._TransformService.serverToDBFormat(
        serverData
      );

      const decoratedIterator = function*(iterator, transactoinsFactory) {
        for (let entry of iterator) {
          const transaction = transactoinsFactory();
          const addRequest = transaction.add(entry.value, entry.key);
          yield new Promise(resolve => {
            addRequest.onsuccess = () => {
              resolve(entry);
            };
          });
        }
      };
      return decoratedIterator(
        iterator(),
        this._transactoinsFactory[objStoreName]
      );
    }

    isSyncNeeded(objStoreName) {
      const transaction = this._transactoinsFactory[objStoreName]();
      const countRequest = transaction.count();
      return new Promise(resolve => {
        countRequest.onsuccess = () => {
          resolve(countRequest.result === 0);
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

  const apiService = new ApiService(API_URL);
  const transformService = new TransformService();
  const storageService = new StorageService(
    STORE_PARAMS,
    w.indexedDB,
    w.IDBKeyRange,
    apiService,
    transformService
  );

  const appPromise = new Promise(resolve => {
    w.document.addEventListener("DOMContentLoaded", () => {
      const app = new App(apiService, storageService, transformService);
      resolve(app);
    });
  });

  w.addEventListener("routeChanged", async event => {
    if (!event.detail.state) {
      console.error("Router error: can't find state object");
      return;
    }

    const app = await appPromise;
    const controllerName = event.detail.state.controller;

    if (typeof app[controllerName] !== "function") {
      console.error("Router error: can't find controller");
      return;
    }

    app[controllerName]();
  });
})(window);

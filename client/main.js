"use strict";
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };
  const TRANSFORM_WORKER_PATH = "/assets/workers/transform.js";

  class App {
    constructor(apiService, storageService) {
      console.log("app loaded");
      this._apiService = apiService;
      this._storageServicePromise = storageService.init();
    }

    async temperatureCtrl() {
      const TABLE_NAME = "temperature";
      const API_PATH = "temperature";
      const storageService = await this._storageServicePromise;
      const itemsIterator = (await storageService.isSyncNeeded(TABLE_NAME))
        ? await storageService.syncTable(TABLE_NAME, API_PATH)
        : await storageService.geTableIterator(TABLE_NAME);

      for (let entry of itemsIterator) {
        const e = await entry;
        console.log(e);
      }
    }

    async precipitationCtrl() {
      //   const storageService = await this._storageServicePromise;
      //   await storageService.precipitationSync();

      console.log("precipitationCtrl");
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

  // тут должен зарпускаться воркер
  class TransformService {
    constructor(workerPath) {
      this._workerPath = workerPath;
    }

    _getNewWorker() {
      return new Worker(this._workerPath);
    }



    serverToDBFormat(serverData) {
      const worker = this._getNewWorker();
      const iteratorFactory = data =>
        function*() {
          for (let key in data) {
            yield { key, value: data[key] };
          }
        };

      worker.postMessage(serverData);

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
      const openedCursorPromiseFactory = () =>
        new Promise(resolve => {
          openedCursor.onsuccess = event => {
            resolve(event.target.result);
          };
        }).then(cursor => {
          if (!cursor) {
              throw new Error("cursor end")
          }
          cursor.continue();
          return cursor;
        });

      const iterator = function*() {
        let end = false;
        while (!end) {
          yield openedCursorPromiseFactory()
            .catch(() => {
              end = true;
            });
        }
      };

      return iterator();
    }

    async syncTable(objStoreName, apiPath) {
      //todo: опустошать таблицу сначала
      const serverData = await this._ApiService.fetch(apiPath);
      const iterator = await this._TransformService.serverToDBFormat(serverData);
      const transaction = this._transactoinsFactory[objStoreName]();
      const decoratedIterator = function*(iterator, transaction) {
        for (let entry of iterator) {
          yield Promise.resolve(entry);
          transaction.add(entry.value, entry.key);
        }
      };
      return decoratedIterator(iterator(), transaction);
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
  const transformService = new TransformService(TRANSFORM_WORKER_PATH);
  const storageService = new StorageService(
    STORE_PARAMS,
    w.indexedDB,
    w.IDBKeyRange,
    apiService,
    transformService
  );

  const appPromise = new Promise(resolve => {
    w.document.addEventListener("DOMContentLoaded", () => {
      resolve(new App(apiService, storageService));
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

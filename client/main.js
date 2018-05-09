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
      const iterator = await this._getItemsIterator(TABLE_NAME, API_PATH);
      const items = [];
      for (let i of iterator()) {
        const item = await i;
        items.push(item);
      }
      console.log(items.length);
    }

    async precipitationCtrl() {
      const TABLE_NAME = "precipitation";
      const API_PATH = "precipitation";
      const iterator = await this._getItemsIterator(TABLE_NAME, API_PATH);
      const items = [];
      for (let i of iterator()) {
        const item = await i;
        items.push(item);
      }
      console.log(items.length);
    }

    async _getItemsIterator(tableName, apiPath) {
      const storageService = await this._storageServicePromise;
      const isSyncNeeded = await storageService.isSyncNeeded(tableName);
      return isSyncNeeded
        ? await storageService.syncAndGetItemsIterator(tableName, apiPath)
        : await storageService.getItemsIterator(tableName);
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
      this._serverToDbWorker = new Worker("/assets/workers/transform-to-db.js");
      this._dbToAppWorker = new Worker("/assets/workers/transform-to-app.js");
    }

    serverToDBFormat(serverData) {
      return this._getResultIterator(serverData, this._serverToDbWorker);
    }

    dbToCanvasFormat(dbData) {
      return this._getResultIterator(dbData, this._dbToAppWorker);
    }

    _getResultIterator(data, worker) {
      worker.postMessage(data);

      const iteratorFactory = limit =>
        function*() {
          let countdown = limit;

          while (countdown-- > 0) {
            console.log(countdown);
            yield new Promise(resolve => {
              worker.onmessage = event => {
                resolve(event.data.result);
              };
            });
          }
        };
      console.log("..");
      return new Promise(resolve => {
        worker.onmessage = event => {
          if (!event.data.len) {
            return;
          }
          console.log(event.data.len);
          resolve(iteratorFactory(event.data.len));
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

    async getItemsIterator(objStoreName, lowerKey, upperKey) {
      const tableEntries = await this._getTableEntries(
        objStoreName,
        lowerKey,
        upperKey
      );

      const transformPomises = this._UtilsService.getObjArray(
        tableEntries.length
      );

      for (let i = 0; i < tableEntries.length; i++) {
        console.log("->", i);
        transformPomises[i] = (await this._TransformService.dbToCanvasFormat(
          tableEntries[i].value
        ))();
      }

      const iterator = function*() {
        for (let i = 0; i < tableEntries.length; i++) {
          for (let promise of transformPomises[i]) {
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

    async syncAndGetItemsIterator(objStoreName, apiPath) {
      //todo: опустошать таблицу сначала
      const serverData = await this._ApiService.fetch(apiPath);
      const tableObjectIt = (await this._TransformService.serverToDBFormat(
        serverData
      ))().next();
      const tableObject = await tableObjectIt.value;

      const transformPomises = this._UtilsService.getObjArray(
        Object.keys(tableObject).length
      );
      let i = 0;
      for (let key in tableObject) {
        transformPomises[i++] = (await this._TransformService.dbToCanvasFormat(
          tableObject[key]
        ))();
      }

      const iteratorFactory = transactoinsFactory =>
        function*() {
          let i = 0;
          for (let key in tableObject) {
            const transaction = transactoinsFactory();
            transaction.add(tableObject[key], key);
            for (let itemPromise of transformPomises[i++]) {
              yield itemPromise;
            }
          }
        };

      return iteratorFactory(this._transactoinsFactory[objStoreName]);
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

  class UtilsService {
    constructor() {}

    getObjArray(count) {
      return Array.apply(null, Array(count)).map(Object.prototype.valueOf, {});
    }
  }

  const utilsService = new UtilsService();
  const apiService = new ApiService(API_URL);
  const transformService = new TransformService();
  const storageService = new StorageService(
    STORE_PARAMS,
    w.indexedDB,
    w.IDBKeyRange,
    apiService,
    transformService,
    utilsService
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

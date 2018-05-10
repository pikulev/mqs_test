"use strict";
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };

  class CanvasDrawer {
    constructor(document, canvasId, width, height) {
      this._canvas = document.getElementById(canvasId);
      this._context = this._canvas.getContext("2d");

      this.width = width;
      this.height = height;

      // grid
      for (let x = 0.5; x <= this.width; x += 20) {
        this._context.moveTo(x, 0);
        this._context.lineTo(x, this.height);
      }
      for (let y = 0.5; y <= this.height; y += 20) {
        this._context.moveTo(0, y);
        this._context.lineTo(this.width, y);
      }

      this._context.strokeStyle = "#eee";
      this._context.stroke();
    }

    *draw(data, dataLength) {
      this._context.beginPath();
      this._context.moveTo(0, this.height / 2);
    //   const dataDensity = dataLength / this.width;

      for (let i = 0; i < dataLength; i += 1) {
        this._context.lineTo(i, (yield) + this.height / 2);
      }
      this._context.strokeStyle = "#999";
      this._context.stroke();
    }
  }

  class App {
    constructor(apiService, storageService, transformService, canvasDrawer) {
      console.log("app loaded");
      this._apiService = apiService;
      this._storageServicePromise = storageService.init();
      this._transformService = transformService;
      this._canvasDrawer = canvasDrawer;
    }

    async temperatureCtrl(lowerKey, upperKey) {
      const TABLE_NAME = "temperature";
      const API_PATH = "temperature";
      const iterator = await this._getItemsIterator(
        TABLE_NAME,
        API_PATH,
        lowerKey,
        upperKey,
        this._canvasDrawer.width
      );
      const items = [];
      const drawIterator = this._canvasDrawer.draw(500);
      for (let i of iterator()) {
        drawIterator.next(i.value);
      }

      console.log(items.length);
    }

    async precipitationCtrl(lowerKey, upperKey) {
      const TABLE_NAME = "precipitation";
      const API_PATH = "precipitation";
      const iterator = await this._getItemsIterator(
        TABLE_NAME,
        API_PATH,
        lowerKey,
        upperKey,
        this._canvasDrawer.width
      );
      const items = [];
      const drawIterator = this._canvasDrawer.draw(500);
      for (let i of iterator()) {
        drawIterator.next(i.value);
      }

      console.log(items.length);
    }

    async _getItemsIterator(
      tableName,
      apiPath,
      lowerKey,
      upperKey,
      averageToLimit
    ) {
      const storageService = await this._storageServicePromise;
      const isSyncNeeded = await storageService.isSyncNeeded(tableName);
      return isSyncNeeded
        ? await storageService.syncAndGetItemsIterator(tableName, apiPath)
        : await storageService.getItemsIterator(
            tableName,
            lowerKey,
            upperKey,
            averageToLimit
          );
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
    constructor(UtilsService) {
      this._UtilsService = UtilsService;
      this._serverToDbWorker = new Worker("/assets/workers/transform-to-db.js");
      this._dbToAppWorker = new Worker("/assets/workers/transform-to-app.js");
    }

    _getOnMessagePromisesFactory(worker) {
      return () =>
        new Promise(
          resolve =>
            console.log(worker.onmessage) || (worker.onmessage = resolve)
        ).then(event => event.data);
    }

    serverToDBFormat(serverData, chunkSize) {
      return this._getResultIterator(
        serverData,
        chunkSize,
        this._serverToDbWorker
      );
    }

    dbToCanvasFormat(dbData, chunkSize) {
      return this._getResultIterator(dbData, chunkSize, this._dbToAppWorker);
    }

    _getResultIterator(values, chunkSize = 1, worker) {
      const results = this._UtilsService.getObjArray(
        Math.ceil(values.length / chunkSize)
      );

      const iterator = function*() {
        for (let i = 0; i < results.length; i++) {
          yield results[i];
        }
      };

      worker.postMessage({ values, chunkSize });

      return new Promise(resolve => {
        let resultsCounter = 0;
        worker.onmessage = event => {
          if (resultsCounter > results.length) {
            return;
          }

          results[resultsCounter++] = event.data;
          if (resultsCounter === results.length) {
            resolve(iterator);
          }
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

    async getItemsIterator(objStoreName, lowerKey, upperKey, averageToLimit) {
      const tableEntries = await this._getTableEntries(
        objStoreName,
        lowerKey,
        upperKey
      );

      const transformPomises = this._UtilsService.getObjArray(
        tableEntries.length
      );
      const chunkSize = averageToLimit
        ? Math.ceil(tableEntries.length / averageToLimit)
        : 1;

      for (let i = 0; i < tableEntries.length; i++) {
        transformPomises[i] = await this._TransformService.dbToCanvasFormat(
          tableEntries[i].value,
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

    async syncAndGetItemsIterator(objStoreName, apiPath) {
      //todo: опустошать таблицу сначала
      const serverData = await this._ApiService.fetch(apiPath);
      const tableObjectIt = (await this._TransformService.serverToDBFormat(
        serverData,
        1
      ))().next();
      const tableObject = tableObjectIt.value;

      const transformPomises = this._UtilsService.getObjArray(
        Object.keys(tableObject).length
      );
      let i = 0;
      for (let key in tableObject) {
        transformPomises[i++] = await this._TransformService.dbToCanvasFormat(
          tableObject[key],
          1
        );
      }

      const iteratorFactory = transactoinsFactory =>
        function*() {
          let i = 0;
          for (let key in tableObject) {
            const transaction = transactoinsFactory();
            transaction.add(tableObject[key], key);
            for (let itemPromise of transformPomises[i++]()) {
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

    getDeferredArray(count) {
      return Array.apply(null, Array(count)).map(
        Deferred.prototype.valueOf,
        new Deferred()
      );
    }
  }

  class Deferred {
    constructor() {
      this.promise = new Promise(resolve => {
        this.resolve = resolve;
      });
    }
  }

  const utilsService = new UtilsService();
  const apiService = new ApiService(API_URL);
  const transformService = new TransformService(utilsService);
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
      const canvasDrawer = new CanvasDrawer(w.document, "canvas", 501, 301);
      const app = new App(
        apiService,
        storageService,
        transformService,
        canvasDrawer
      );
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

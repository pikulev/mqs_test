"use strict";
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };

  class CanvasDrawer {
    constructor(canvas) {
      this._canvas = canvas;
      this._context = this._canvas.getContext("2d");

      this.width = this._canvas.width;
      this.height = this._canvas.height;

      this.clear();
    }

    clear() {
      this._context.clearRect(0, 0, this.width, this.height);
      this._context.beginPath();

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

    *draw() {
      this.clear();
      this._context.beginPath();
      this._context.moveTo(0, this.height / 2);

      let value;
      let i = 0;
      while (value !== null) {
        value = yield;
        this._context.lineTo(i++, value + this.height / 2);
      }
      this._context.strokeStyle = "#999";
      this._context.stroke();
    }
  }

  class App {
    constructor(
      apiService,
      storageService,
      transformService,
      canvasDrawer,
      fromSelectElement,
      toSelectElement
    ) {
      console.log("app loaded");
      this._apiService = apiService;
      this._storageServicePromise = storageService.init();
      this._transformService = transformService;
      this._canvasDrawer = canvasDrawer;

      this._fromSelectElement = fromSelectElement;
      this._toSelectElement = toSelectElement;
      this._fromSelectElement.onchange = () => this._onToOptionSelectHandler();
      this._toSelectElement.onchange = () => this._onToOptionSelectHandler();
      this._updateOptions(1881, 2006);
    }

    temperatureCtrl(lowerKey, upperKey) {
      const TABLE_NAME = "temperature";
      const API_PATH = "temperature";
      this._updateItems(TABLE_NAME, API_PATH, lowerKey, upperKey);
    }

    precipitationCtrl(lowerKey, upperKey) {
      const TABLE_NAME = "precipitation";
      const API_PATH = "precipitation";
      this._updateItems(TABLE_NAME, API_PATH, lowerKey, upperKey);
    }

    async _updateItems(tableName, apiPath) {
      const iterator = await this._getItemsIterator(
        tableName,
        apiPath,
        this._selectedOptions.fromValue,
        this._selectedOptions.toValue,
        this._canvasDrawer.width
      );
      const items = [];
      const drawIterator = this._canvasDrawer.draw();

      for (let i of iterator()) {
        drawIterator.next(i.value);
        items.push(i);
      }
      drawIterator.next(null);
      console.log(items.length);
    }

    _updateOptions(fromYear, toYear) {
      const years = Array(toYear - fromYear + 1)
        .fill()
        .map((_, i) => fromYear + i);

      const fill = (el, year) => {
        const option = document.createElement("option");
        option.setAttribute("data-from-value", `${year}-01-01`);
        option.setAttribute("data-to-value", `${year}-12-31`);
        option.innerHTML = year;
        el.appendChild(option);
      };

      for (let i = 0; i < years.length; i++) {
        fill(this._fromSelectElement, years[i]);
      }
      for (let i = years.length; i--; ) {
        fill(this._toSelectElement, years[i]);
      }

      this._selectedOptions = {};
    }

    _onToOptionSelectHandler() {
      console.log(this._selectedOptions);
      this._selectedOptions = {
        fromValue: this._fromSelectElement.selectedOptions[0].dataset.fromValue,
        toValue: this._toSelectElement.selectedOptions[0].dataset.toValue
      };
      w.reloadCurrentRoute();
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

      if (isSyncNeeded) {
        const a = await storageService.sync(tableName, apiPath);
      }

      return storageService.getItemsIterator(
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
        this._serverToDbWorker,
        serverData,
        chunkSize,
        1
      );
    }

    dbToCanvasFormat(dbData, chunkSize) {
      return this._getResultIterator(this._dbToAppWorker, dbData, chunkSize);
    }

    _getResultIterator(
      worker,
      values,
      chunkSize = 1,
      resultsLength = values.length
    ) {
      const results = this._UtilsService.getObjArray(
        Math.ceil(resultsLength / chunkSize)
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
        ? Math.ceil(tableEntries.length * 31 / averageToLimit)
        : 1;

      console.log(chunkSize, averageToLimit, tableEntries.length);

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
      const canvasEl = w.document.getElementById("canvas");
      const fromSelectEl = w.document.getElementById("from-select");
      const toSelectEl = w.document.getElementById("to-select");

      const canvasDrawer = new CanvasDrawer(canvasEl);

      const app = new App(
        apiService,
        storageService,
        transformService,
        canvasDrawer,

        fromSelectEl,
        toSelectEl
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

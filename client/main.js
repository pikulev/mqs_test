"use strict";
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };
  const TRANSFORM_WORKER_PATH = "/assets/workers/transform.js";

  class App {
    constructor(apiService, dbService) {
      console.log("app loaded");
      this._apiService = apiService;
      this._dbServicePromise = dbService.init();
    }

    async temperatureCtrl() {
      const dbService = await this._dbServicePromise;
      await dbService.temperatureSync();

      console.log("temperatureCtrl");
    }

    async precipitationCtrl() {
      const dbService = await this._dbServicePromise;
      await dbService.precipitationSync();

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

    toDBFormat(serverData) {
      const worker = this._getNewWorker();
      const iterator = function*(data) {
        for (let i = 0; i < data.length; i++) {
          yield data[i];
        }
      };

      worker.postMessage(serverData);

      return new Promise(resolve => {
        worker.onmessage = event => {
          if (!event.data || !event.data.length) {
            throw new Error("toDBFormat error: result is empty");
          }
          resolve(iterator(event.data));
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
        DBOpenRequest.onsuccess = async event => {
          this._db = DBOpenRequest.result;
          this._initTransactionsFactory(this._db);
          resolve(this);
        };
        DBOpenRequest.onupgradeneeded = event =>
          this._onupgradeneeded(event.target.result);
      });
    }

    temperatureSync() {
      return this._syncTable("temperature", "temperature");
    }

    precipitationSync() {
      return this._syncTable("precipitation", "precipitation");
    }

    temperatureRangeGen(lowerKey, upperKey) {
      return this._getRangeGenerator("temperature", lowerKey, upperKey);
    }

    precipitationRangeGen(lowerKey, upperKey) {
      return this._getRangeGenerator("temperature", lowerKey, upperKey);
    }

    _getRangeGenerator(objStoreName, lowerKey, upperKey) {
      const transaction = this._transactoinsFactory[objStoreName]();
      const index = transaction.index("yearMonth");
      const boundKeyRange = this._IDBKeyRange.bound(
        lowerKey,
        upperKey,
        false,
        false
      );
      const iterator = function*(cursor) {
        if (cursor) {
          yield cursor;
          cursor.continue();
        }
      };

      return new Promise(resolve => {
        index.openCursor(boundKeyRange).onsuccess = event => {
          const cursor = event.target.result;
          resolve(iterator(cursor));
        };
      });
    }

    async _syncTable(objStoreName, apiPath) {
      const isSyncNeeded = await this._isSyncNeeded(objStoreName);
      if (!isSyncNeeded) {
        return;
      }

      const serverData = await this._ApiService.fetch(apiPath);
      const iterator = await this._TransformService.toDBFormat(serverData);
      const transaction = this._transactoinsFactory[objStoreName]();
      for (let entry of iterator) {
          console.log("add", entry);
        transaction.add(entry.value, entry.key);
      }
    }

    _isSyncNeeded(objStoreName) {
      const transaction = this._transactoinsFactory[objStoreName]();
      const countRequest = transaction.count();
      return new Promise(resolve => {
        countRequest.onsuccess = () => {
          resolve(countRequest.result === 0);
        };
      });
    }

    _initTransactionsFactory(db) {
      this._transactoinsFactory = Object.create(
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

  const app = new App(apiService, storageService);

  w.addEventListener("routeChanged", async event => {
    if (!event.detail.state) {
      console.error("Router error: can't find state object");
      return;
    }
    if (typeof app[event.detail.state.controller] !== "function") {
      console.error("Router error: can't find controller");
      return;
    }
    app[event.detail.state.controller]();
  });
})(window);

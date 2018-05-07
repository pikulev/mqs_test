(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    keyName: "t",
    valueName: "v"
  };

  class App {
    constructor(apiService, dbService) {
      this._apiService = apiService;
      this._dbServicePromise = dbService.init();
    }

    temperatureCtrl() {
      console.log("temperatureCtrl");
    }

    precipitationCtrl() {
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
        // todo: why await?
        return await response.json();
      } catch (err) {
        console.error(err);
      }
    }
  }

  class DbService {
    constructor(indexedDB, IDBKeyRange, version, { keyName, valueName }) {
      this.version = version;
      this._indexedDB = indexedDB;
      this._IDBKeyRange = IDBKeyRange;
      this._keyName = keyName;
      this._valueName = valueName;
    }

    init() {
      const DBOpenRequest = this._indexedDB.open("MQS_test_DB", this.version);

      return new Promise(resolve => {
        DBOpenRequest.onerror = event => {
          throw new Error("Error loading database (opening)");
        };
        DBOpenRequest.onsuccess = event => {
          this._db = DBOpenRequest.result;
          resolve(this);
        };
        DBOpenRequest.onupgradeneeded = event =>
          this._onupgradeneeded(event.target.result);
      });
    }

    temperatureRangeGen(lowerKey, upperKey) {
        return this._getRangeGenerator(this._temperatureObjStore, lowerKey, upperKey)
    }

    precipitationRangeGen(lowerKey, upperKey) {
        return this._getRangeGenerator(this._precipitationObjStore, lowerKey, upperKey)
    }

    _getRangeGenerator(objStore, lowerKey, upperKey) {
      const index = objStore.index(this._keyName);
      const boundKeyRange = IDBKeyRange.bound(lowerKey, upperKey, false, false);

      return function* () {
        index.openCursor(boundKeyRange).onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            yield cursor
            cursor.continue();
          }
        };
      }
    }

    _onupgradeneeded(db) {
      db.onerror = function(event) {
        throw new Error("Error loading database (upgrading)");
      };

      this._temperatureObjStore = db.createObjectStore("temperature", {
        keyPath: this._keyName
      });
      this._precipitationObjStore = db.createObjectStore("precipitation", {
        keyPath: this._keyName
      });
      this._temperatureObjStore.createIndex(this._valueName, this._valueName, {
        unique: false
      });
      this._precipitationObjStore.createIndex(
        this._valueName,
        this._valueName,
        { unique: false }
      );
    }
  }

  const dbService = new DbService(w.indexedDB, w.IDBKeyRange, 2, STORE_PARAMS);
  const apiService = new ApiService(API_URL);
  const app = new App(apiService, dbService);

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

import { UtilsService, Deferred } from "/assets/utils.js";
import ApiService from "/assets/api.js";
import TransformService from "/assets/transforms.js";
import StorageService from "/assets/storage.js";
import CanvasDrawer from "/assets/canvas.js";

("use strict");
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };

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

    temperatureCtrl() {
      const TABLE_NAME = "temperature";
      const API_PATH = "temperature";
      const yScaleFactor = 2;
      this._updateItems(TABLE_NAME, API_PATH, yScaleFactor);
    }

    precipitationCtrl() {
      const TABLE_NAME = "precipitation";
      const API_PATH = "precipitation";
      const yScaleFactor = 6;
      this._updateItems(TABLE_NAME, API_PATH, yScaleFactor);
    }

    async _updateItems(tableName, apiPath, yScaleFactor) {
      const iterator = await this._getItemsIterator(
        tableName,
        apiPath,
        this._selectedOptions.fromValue,
        this._selectedOptions.toValue,
        yScaleFactor,
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
      yScaleFactor,
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
        yScaleFactor,
        averageToLimit
      );
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

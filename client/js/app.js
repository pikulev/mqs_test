import { UtilsService, Deferred } from "/js/utils.js";
import ApiService from "/js/api.js";
import TransformService from "/js/transforms.js";
import StorageService from "/js/storage.js";
import CanvasDrawer from "/js/canvas.js";

/*
  * App - класс реализующий логику приложения
  * 
  * */
class App {
  constructor(apiService, storageService, transformService, canvasDrawer, fromSelectElement, toSelectElement) {
    this._apiService = apiService;
    this._storageServicePromise = storageService.init();
    this._transformService = transformService;
    this._canvasDrawer = canvasDrawer;

    // Берем из зависимостей два selector-a
    this._fromSelectElement = fromSelectElement;
    this._toSelectElement = toSelectElement;
    // Вешаем обработчики
    this._fromSelectElement.onchange = () => this._onToOptionSelectHandler();
    this._toSelectElement.onchange = () => this._onToOptionSelectHandler();
    // Предзаполняем годами (чтобы не усложнять, на самом деле :)
    this._updateOptions(1881, 2006);
  }

  /*
  * temperatureCtrl выполняется при переходе на роут с температурой
  * public
  * */
  temperatureCtrl() {
    const TABLE_NAME = "temperature";
    const API_PATH = "temperature";
    const yScaleFactor = 2;

    this._updateItems(TABLE_NAME, API_PATH, yScaleFactor);
  }

  /*
  * precipitationCtrl выполняется при переходе на роут с осадками
  * public
  * */
  precipitationCtrl() {
    const TABLE_NAME = "precipitation";
    const API_PATH = "precipitation";
    const yScaleFactor = 6;

    this._updateItems(TABLE_NAME, API_PATH, yScaleFactor);
  }

  /*
  * _updateItems берет итератор и пробегается по нему, рисуя на холст
  * private
  * */
  async _updateItems(tableName, apiPath, yScaleFactor) {
    const iterator = await this._getItemsIterator(
      tableName,
      apiPath,
      this._selectedOptions.fromValue,
      this._selectedOptions.toValue,
      yScaleFactor,
      this._canvasDrawer.width
    );
    const drawIterator = this._canvasDrawer.draw();

    for (let i of iterator()) {
      drawIterator.next(i.value);
    }

    drawIterator.next(null);
  }

  /*
  * _updateOptions создаёт набор опций для селекторов
  * private
  * */
  _updateOptions(fromYear, toYear) {
    const years = Array(toYear - fromYear + 1)
      .fill()
      .map((_, i) => fromYear + i);

    const fill = (el, year) => {
      const option = document.createElement("option");
      // показываем данные года с первого января годя из "from"
      option.setAttribute("data-from-value", `${year}-01-01`);
      // и до конца декабря года в "to"
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

  /*
  * _onToOptionSelectHandler обрабатываем смену периода
  * private
  * */
  _onToOptionSelectHandler() {
    this._selectedOptions = {
      fromValue: this._fromSelectElement.selectedOptions[0].dataset.fromValue,
      toValue: this._toSelectElement.selectedOptions[0].dataset.toValue
    };
    // за это стыдно, роутер в зачатке :)
    window.reloadCurrentRoute();
  }

  /*
  * _getItemsIterator получаем из базы итератор и если надо синкает базу с сервером
  * private
  * */
  async _getItemsIterator(tableName, apiPath, lowerKey, upperKey, yScaleFactor, averageToLimit) {
    const storageService = await this._storageServicePromise;
    const isSyncNeeded = await storageService.isSyncNeeded(tableName);

    if (isSyncNeeded) {
      const a = await storageService.sync(tableName, apiPath);
    }

    return storageService.getItemsIterator(tableName, lowerKey, upperKey, yScaleFactor, averageToLimit);
  }
}

/*
  * Исполнительная часть приложения 
  * 
  * */
(w => {
  const API_URL = "/api";
  const STORE_PARAMS = {
    dbName: "MQS_test_DB",
    version: 2
  };

  /*
  * Берем всё нужное
  * 
  * */
  const utilsService = new UtilsService();
  const apiService = new ApiService(API_URL);
  const transformService = new TransformService(utilsService);
  const storageService = new StorageService(STORE_PARAMS, w.indexedDB, w.IDBKeyRange, apiService, transformService, utilsService);

  /*
  * Как только документ будет готов - отдадим сконфигурированный инстанс приложения
  * 
  * */
  const appPromise = new Promise(resolve => {
    w.document.addEventListener("DOMContentLoaded", () => {
      const canvasEl = w.document.getElementById("canvas");
      const fromSelectEl = w.document.getElementById("from-select");
      const toSelectEl = w.document.getElementById("to-select");

      const canvasDrawer = new CanvasDrawer(canvasEl);

      // конфигурируем
      const app = new App(
        apiService,
        storageService,
        transformService,
        canvasDrawer,

        fromSelectEl,
        toSelectEl
      );

      // отдаем
      resolve(app);
    });
  });

  /*
  * Ловим события routeChanged и запускает нужный контроллер
  * 
  * */
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

    // вот тут запускает
    app[controllerName]();
  });
})(window);

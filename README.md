# Тестовое задания MetaQuotes Software

## Запуск

```bash
$ git clone git@github.com:pikulev/mqs_test.git
$ cd mqs_test
$ node server/server.js; open http://localhost:9077
```

## О результате

Я решил попробовать применить подход обработки данных на протяжении всего пути (сервер-база-холст или база-холст) с помощью одного итератора, то есть реализовать что-то похожее на поток, pipeline, если угодно. У такого подхода есть ряд сложностей, учитывая наши вводные. Группировка данных по месяцам для записи в базу создаёт места, где приходится формировать "пачки" данных, это немного сбивает плавность процессинга. С другой стороны, вроде как, соблюдается разумный баланс кол-во обработчиков / объём данных в одном сообщении. 

В целом, мне кажется, что с задачей я справился. Работает без блокировок UI, performance-анализ показывает ровную, без скачков, и не очень нагруженную линию занятости CPU скриптом, память не утекает. Хочу сказать, задача прекрасная, мне очень хочется, чтобы фронтендеры вообще чаще занимались такими задачами. Спасибо, мне понравилось :)

### Известные проблемы

Есть ряд проблем, которые можно решить, но они требуют уже более скурпулезного подхода. Например, усреднение данных для вывода на хослт ("сжатие" до средних знаений, точнее). Сейчас оно работает так - обрабатываем пачками по месяцу, потому что в БД хранится именно так, но если мы захотим усреднять по периоду больше, чем месяц, то нам надо либо делать ещё одну итерацию усреднения по получившемуся массиву, либо вообще в самом начале, когда берем из базы трансформировать в плоскую структуру и усреднять хоть по всем сразу. Первый подход может быть чуть дешевле по вычислениям, но сложнее в поддержке, к сожалению - получится усреднение каскадами, сложнее будет управлять этим.

Сейчас, кстати, сделано усреднение до среднеарифметического, что не всегда хорошо, могут пропадать аномальные пики. Если они важны, то можно менять функцию усреднения.

Вторая проблема связана с тем, что длина данных в итератора не известна, по сути работы итератора (поток же). Поэтому следует реализовать проброс длины вместе с итератором, у меня эта часть, к сожалению, не реализована.

Третья проблема связана с первой - не реализована интерполяция данных для сильно разреженных по отношению к ширине холста массивов. Рисует просто сколько есть в стандартной плотности одна запись - один пиксель. 

## Как устроен проект

### Server

Простой сервер для SPA с раздельными url-пространствами для API и для файлов приложения.

### Client

В основе что-то отдаленно напоминающее архитектуру SPA :)

#### [js/routing.js](client/js/routing.js)

Обеспечивает навигацию по разделам, системой событий обеспечивает запуск соответствующего контроллера приложения.

#### [js/app.js](client/js/app.js)

Содержит класс приложения, а также сконфигурированный зависимостями и запущенный экземпляр.

#### [js/api.js](client/js/api.js)

Сервис реализующий часть общения с API.

#### [js/storage.js](client/js/storage.js)

Реазилует общение с IndexedDB.

#### [js/transform.js](client/js/transform.js)

Класс, который предоставляет методы взаимодействия с веб-воркерами.

#### [js/workers/transform-to-db.js](client/js/workers/transform-to-db.js) и [js/workers/transform-to-app.js](client/js/workers/transform-to-app.js)

Файлы воркеров, реализуют трансформацию данных для записи в БД в нужном формате и для работы в контроллерах приложения - уже готовые к выводу на canvas.

#### [js/canvas.js](client/js/routing.js)

Этот класс реализует часть вывода данных на canvas.
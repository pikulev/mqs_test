onmessage = event => {
  const TIME_KEY = "t";
  const TIME_SPLITTER = "-";
  const VALUE_KEY = "v";

  const values = event.data.values;
  let result = null;

  for (let i = 0; i < values.length; i++) {
    const t = values[i][TIME_KEY].split(TIME_SPLITTER);
    const day = t.pop();
    const yearMonth = t.join(TIME_SPLITTER);

    result = result || {};
    result[yearMonth] = result[yearMonth] || [];

    result[yearMonth].push(values[i]);
  }

  postMessage(result);
};

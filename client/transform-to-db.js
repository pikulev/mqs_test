onmessage = event => {
  const TIME_KEY = "t";
  const TIME_SPLITTER = "-";
  const VALUE_KEY = "v";

  postMessage({ len: 1 });

  let result = null;
  for (let i = 0; i < event.data.length; i++) {
    const t = event.data[i][TIME_KEY].split(TIME_SPLITTER);
    const day = t.pop();
    const yearMonth = t.join(TIME_SPLITTER);

    result = result || {};
    result[yearMonth] = result[yearMonth] || [];

    result[yearMonth].push(event.data[i]);
  }
  postMessage({ result });
};

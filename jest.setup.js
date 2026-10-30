if (typeof structuredClone === 'undefined') {
  global.structuredClone = function (val) {
    return JSON.parse(JSON.stringify(val));
  };
}

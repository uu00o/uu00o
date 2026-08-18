// 浏览器端 require shim（必须最先加载）
(function () {
  window.IsoGame = window.IsoGame || {};
  window.require = function (name) {
    var key = name.replace(/^\.\//, '').replace(/\.js$/, '');
    var m = window.IsoGame[key];
    if (!m) throw new Error('module not loaded: ' + name);
    return m;
  };
})();

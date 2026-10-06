window.HallPhoto = {
  text: "가족애 장례",
  exts: ["jpg", "jpeg", "png", "webp"],

  files: function (name, index) {
    return [
      name + " (" + index + ")",
      name + "(" + index + ")",
      String(index)
    ];
  },

  url: function (name, file, ext) {
    return "images/halls/" + encodeURIComponent(name) + "/" + encodeURIComponent(file) + "." + ext;
  },

  load: function (name, index) {
    var listed = window.HALL_PHOTOS && window.HALL_PHOTOS[name];
    if (listed) {
      var file = listed[index - 1];
      if (!file) return Promise.resolve(null);
      return this.loadUrl("images/halls/" + encodeURIComponent(name) + "/" + encodeURIComponent(file));
    }
    var files = this.files(name, index);
    var exts = this.exts;
    var self = this;
    return new Promise(function (resolve) {
      var fileIndex = 0;
      var extIndex = 0;
      function tryNext() {
        if (fileIndex >= files.length) {
          resolve(null);
          return;
        }
        var img = new Image();
        var src = self.url(name, files[fileIndex], exts[extIndex]);
        img.onload = function () { resolve(img); };
        img.onerror = function () {
          extIndex += 1;
          if (extIndex >= exts.length) {
            extIndex = 0;
            fileIndex += 1;
          }
          tryNext();
        };
        img.src = src;
      }
      tryNext();
    });
  },

  loadUrl: function (src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  },

  mark: function (img, mode) {
    var canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    var text = this.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    if (mode === "tile") {
      var size = Math.max(28, Math.round(Math.min(canvas.width, canvas.height) / 12));
      ctx.font = "700 " + size + "px 'Noto Sans KR', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.strokeStyle = "rgba(16,40,61,0.45)";
      ctx.lineWidth = Math.max(2, size / 12);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      var gapX = size * 6.4;
      var gapY = size * 3.2;
      for (var y = -canvas.height; y <= canvas.height; y += gapY) {
        for (var x = -canvas.width; x <= canvas.width; x += gapX) {
          ctx.strokeText(text, x, y);
          ctx.fillText(text, x, y);
        }
      }
      ctx.restore();
    } else {
      var cardSize = Math.max(18, Math.round(canvas.width / 9));
      ctx.font = "700 " + cardSize + "px 'Noto Sans KR', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.strokeStyle = "rgba(16,40,61,0.62)";
      ctx.lineWidth = Math.max(3, cardSize / 8);
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }
    return canvas;
  }
};

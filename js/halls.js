(function () {
  if (!window.HALLS || !window.HallPhoto) return;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function tag(hall) {
    return esc(hall.kind) + (hall.hours ? " · " + esc(hall.hours) : "");
  }

  function facts(hall) {
    var bits = "";
    if (hall.rooms) bits += "<span>빈소 " + esc(hall.rooms) + "실</span>";
    if (hall.parking) bits += "<span>주차 " + esc(hall.parking) + "대</span>";
    return bits ? '<div class="meta">' + bits + "</div>" : "";
  }

  function findHall(name) {
    var found = null;
    window.HALLS.forEach(function (item) {
      item.halls.forEach(function (hall) {
        if (hall.name === name) found = { hall: hall, region: item };
      });
    });
    return found;
  }

  var detail = document.querySelector("[data-hall-detail]");
  if (detail) {
    var params = new URLSearchParams(location.search);
    var name = params.get("name") || "";
    var match = findHall(name);
    var title = document.querySelector("[data-hall-title]");
    var lead = document.querySelector("[data-hall-lead]");
    var gallery = document.querySelector("[data-hall-gallery]");
    if (!match) {
      if (title) title.textContent = "장례식장을 찾지 못했습니다";
      detail.innerHTML = '<p class="note">목록에서 다시 선택해 주세요. <a href="halls.html">장례식장정보</a></p>';
      return;
    }
    var hall = match.hall;
    document.title = hall.name + " 사진 | 가족애 장례";
    if (title) title.textContent = hall.name;
    if (lead) lead.textContent = hall.address;
    var map = "https://map.kakao.com/link/search/" + encodeURIComponent(hall.name + " " + hall.address);
    detail.innerHTML =
      '<article class="hall-card">' +
      '<span class="tag">' + tag(hall) + "</span>" +
      "<p>" + esc(hall.address) + "</p>" +
      (hall.phone ? '<p><a class="tel" href="tel:' + hall.phone.replace(/[^0-9]/g, "") + '">' + esc(hall.phone) + "</a></p>" : "") +
      facts(hall) +
      '<div class="meta">' + hall.amenities.map(function (item) { return "<span>" + esc(item) + "</span>"; }).join("") + "</div>" +
      '<div class="hall-actions"><a href="' + map + '" target="_blank" rel="noopener">길찾기</a><a href="halls.html">목록으로</a></div>' +
      "</article>";

    function addMore(index) {
      window.HallPhoto.load(hall.name, index).then(function (img) {
        if (!img || !gallery) {
          if (index === 2 && !gallery.children.length) {
            gallery.innerHTML = '<p class="note">추가 사진은 장례식장이름 (2)부터 올리면 이 화면에 표시됩니다. 목록 카드에는 (1) 사진만 나옵니다.</p>';
          }
          return;
        }
        var figure = document.createElement("figure");
        var canvas = window.HallPhoto.mark(img, "tile");
        canvas.setAttribute("aria-label", hall.name + " 사진 " + index);
        var caption = document.createElement("figcaption");
        caption.textContent = "(" + index + ")";
        figure.appendChild(canvas);
        figure.appendChild(caption);
        gallery.appendChild(figure);
        addMore(index + 1);
      });
    }
    addMore(2);
    return;
  }

  var list = document.querySelector("[data-hall-list]");
  var chips = document.querySelector("[data-region-chips]");
  var search = document.querySelector("[data-hall-search]");
  var kindBox = document.querySelector("[data-kind-chips]");
  if (!list || !chips) return;

  var region = "all";
  var kind = "all";

  var groups = [
    { id: "gyeongnam-city", label: "경상남도 시", match: function (item) { return item.parent === "gyeongnam" && item.type === "시"; } },
    { id: "gyeongnam-gun", label: "경상남도 군", match: function (item) { return item.parent === "gyeongnam" && item.type === "군"; } },
    { id: "busan", label: "부산광역시", match: function (item) { return item.parent === "busan"; } }
  ];

  groups.forEach(function (group) {
    var title = document.createElement("p");
    title.className = "region-label";
    title.textContent = group.label;
    chips.appendChild(title);
    var row = document.createElement("div");
    row.className = "filters";
    window.HALLS.filter(group.match).forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = item.name + " " + item.halls.length;
      button.addEventListener("click", function () {
        region = region === item.id ? "all" : item.id;
        render();
      });
      button.dataset.region = item.id;
      row.appendChild(button);
    });
    chips.appendChild(row);
  });

  if (kindBox) {
    kindBox.addEventListener("click", function (event) {
      var button = event.target.closest("[data-kind]");
      if (!button) return;
      kind = button.getAttribute("data-kind");
      render();
    });
  }
  if (search) search.addEventListener("input", render);

  function render() {
    document.querySelectorAll("[data-region]").forEach(function (button) {
      button.classList.toggle("on", button.dataset.region === region);
    });
    if (kindBox) {
      kindBox.querySelectorAll("[data-kind]").forEach(function (button) {
        button.classList.toggle("on", button.getAttribute("data-kind") === kind);
      });
    }

    var query = search ? search.value.trim() : "";
    list.innerHTML = "";
    var shown = 0;

    window.HALLS.forEach(function (item) {
      if (region !== "all" && item.id !== region) return;
      var halls = item.halls.filter(function (hall) {
        if (kind !== "all" && hall.kind !== kind) return false;
        if (!query) return true;
        return (hall.name + hall.address + hall.phone).indexOf(query) !== -1;
      });
      if (!halls.length) return;
      var heading = document.createElement("h2");
      heading.className = "region-label";
      heading.textContent = (item.parent === "busan" ? "부산 " : "") + item.name;
      list.appendChild(heading);
      var grid = document.createElement("div");
      grid.className = "grid-2";
      halls.forEach(function (hall) {
        shown += 1;
        var card = document.createElement("article");
        card.className = "hall-card";
        var map = "https://map.kakao.com/link/search/" + encodeURIComponent(hall.name + " " + hall.address);
        var page = "hall.html?name=" + encodeURIComponent(hall.name);
        card.innerHTML =
          '<span class="tag">' + tag(hall) + "</span>" +
          '<div class="hall-head"><div class="hall-copy">' +
          "<h3>" + esc(hall.name) + "</h3>" +
          "<p>" + esc(hall.address) + "</p>" +
          (hall.phone ? '<p><a class="tel" href="tel:' + hall.phone.replace(/[^0-9]/g, "") + '">' + esc(hall.phone) + "</a></p>" : "") +
          "</div></div>" +
          facts(hall) +
          '<div class="meta">' + hall.amenities.map(function (itemName) { return "<span>" + esc(itemName) + "</span>"; }).join("") + "</div>" +
          '<div class="hall-actions"><a href="' + page + '">사진 더보기</a><a href="' + map + '" target="_blank" rel="noopener">길찾기</a></div>';
        grid.appendChild(card);
        window.HallPhoto.load(hall.name, 1).then(function (img) {
          if (!img || !card.isConnected) return;
          var link = document.createElement("a");
          link.className = "hall-photo";
          link.href = page;
          var canvas = window.HallPhoto.mark(img, "card");
          canvas.setAttribute("aria-label", hall.name + " 대표 사진");
          link.appendChild(canvas);
          var head = card.querySelector(".hall-head");
          if (head) head.appendChild(link);
        });
      });
      list.appendChild(grid);
    });

    if (!shown) {
      list.innerHTML = '<p class="note">조건에 맞는 장례식장이 없습니다. 지역을 바꾸거나 1566-2505로 추천을 요청해 주세요.</p>';
    }
  }

  render();
})();

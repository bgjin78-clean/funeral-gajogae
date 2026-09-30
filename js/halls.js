(function () {
  if (!window.HALLS) return;
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
        card.innerHTML =
          '<span class="tag">' + hall.kind + " · " + (hall.hours || "운영시간 문의") + "</span>" +
          "<h3>" + hall.name + "</h3>" +
          "<p>" + hall.address + "</p>" +
          (hall.phone ? '<p><a class="tel" href="tel:' + hall.phone.replace(/[^0-9]/g, "") + '">' + hall.phone + "</a></p>" : "") +
          '<div class="meta"><span>빈소 ' + hall.rooms + '실</span><span>주차 ' + hall.parking + "대</span></div>" +
          '<div class="meta">' + hall.amenities.map(function (name) { return "<span>" + name + "</span>"; }).join("") + "</div>" +
          '<div class="hall-actions"><a href="' + map + '" target="_blank" rel="noopener">길찾기</a></div>';
        grid.appendChild(card);
      });
      list.appendChild(grid);
    });

    if (!shown) {
      list.innerHTML = '<p class="note">조건에 맞는 장례식장이 없습니다. 지역을 바꾸거나 1566-2505로 추천을 요청해 주세요.</p>';
    }
  }

  render();
})();

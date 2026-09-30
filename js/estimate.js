(function () {
  var form = document.querySelector("[data-estimate]");
  if (!form) return;

  var totalEl = document.querySelector("[data-total]");
  var saveEl = document.querySelector("[data-save]");
  var market = 3500000;

  function money(value) {
    return value.toLocaleString("ko-KR") + "원";
  }

  function update() {
    var total = 390000;
    form.querySelectorAll("select").forEach(function (select) {
      var option = select.options[select.selectedIndex];
      var price = option.getAttribute("data-price");
      total += Number(price != null ? price : select.value || 0);
    });
    totalEl.textContent = money(total);
    var saved = Math.max(0, market - total);
    saveEl.textContent = "일반 상조 평균(약 350만원) 대비 약 " + money(saved) + " 절감";
  }

  form.addEventListener("change", update);
  update();
})();

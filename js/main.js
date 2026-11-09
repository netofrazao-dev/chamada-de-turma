// Compatibilidade: celulares com a versão antiga guardada em cache ainda
// carregam este arquivo. Ele força o navegador a buscar a versão nova.
(async () => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* ignora */
  }
  try {
    if (!sessionStorage.getItem("chamada-v2-reload")) {
      sessionStorage.setItem("chamada-v2-reload", "1");
      setTimeout(() => location.reload(), 800);
    }
  } catch {
    /* ignora */
  }
})();

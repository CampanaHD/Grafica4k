const swiper1 = new Swiper('.mySwiper1', {
    loop: true,
  
    // If we need pagination
    pagination: {
      el: '.btn-pagination-1',
      clickable: true,
      
    },
  
    // Navigation arrows
    navigation: {
      nextEl: '.btn-next-1',
      prevEl: '.btn-prev-1',
    },

    spaceBetween: 10,
    scrollbar: {
      el: '.swiper-scrollbar',
    },
    slidesPerView: 6,

  });

  const swiper2 = new Swiper('.mySwiper2', {
    loop: true,
  
    // If we need pagination
    pagination: {
      el: '.btn-pagination-2',
      clickable: true,
      
    },
  
    // Navigation arrows
    navigation: {
      nextEl: '.btn-next-2',
      prevEl: '.btn-prev-2',
    },

    spaceBetween: 13,
    scrollbar: {
      el: '.swiper-scrollbar',
    },
    slidesPerView: 4,

  });

  const swiper3 = new Swiper('.mySwiper3', {
    loop: true,
  
    // If we need pagination
    pagination: {
      el: '.btn-pagination-3',
      clickable: true,
      
    },
  
    // Navigation arrows
    navigation: {
      nextEl: '.btn-next-3',
      prevEl: '.btn-prev-3',
    },

    spaceBetween: 30,
    scrollbar: {
      el: '.swiper-scrollbar',
    },
    slidesPerView: 5,

  });
 
  function enviarWhatsAppIcone() {
    const telefone = "5514981520127";
    const url = `https://wa.me/${telefone}?`;
    window.open(url, "_blank");
}

function enviarWhatsAppSuporte() {
  const telefone = "5514981520127";
  const url = `https://wa.me/${telefone}?text=Olá, estou com duvidas, gostaria de um suporte para me auxiliar!`;
  window.open(url, "_blank");
}

function buscar() {
  let input = document.getElementById("exampleDataList").value;
  if (input) {
      // Aqui você pode redirecionar para uma página de busca, exemplo:
      window.location.href = "Pesquisar.html?query=" + encodeURIComponent(input);
  } else {
      alert("Digite algo para buscar.");
  }
}


// seção Marcas / empresas
const logos = [

  [
    "imagens/Empresas/AGFibra.png",
    "imagens/Empresas/Amanda Campos.png",
    "imagens/Empresas/Ana Albanaz.png",
    "imagens/Empresas/Andaimes Elimar.png",
    "imagens/Empresas/Apta.png"
  ],

  [
    "imagens/Empresas/Art e Estylo.png",
    "imagens/Empresas/Bem Bolado.png",
    "imagens/Empresas/Brabus.png",
    "imagens/Empresas/Carvalima.png",
    "imagens/Empresas/CTF.png"
  ],

  [
    "imagens/Empresas/Espaço Oz.png",
    "imagens/Empresas/Facil Higiene.png",
    "imagens/Empresas/GDSul.png",
    "imagens/Empresas/Havilá.png",
    "imagens/Empresas/IPM.png"
  ],

  [
    "imagens/Empresas/Japapo.png",
    "imagens/Empresas/Lojas Cem.png",
    "imagens/Empresas/Los Andes.png",
    "imagens/Empresas/Magnificos.png",
    "imagens/Empresas/My Own.png"
  ],

  [
    "imagens/Empresas/Naiote.png",
    "imagens/Empresas/Paraiso das Noivas.png",
    "imagens/Empresas/Passe Express.png",
    "imagens/Empresas/Pet Space.png",
    "imagens/Empresas/Place.png"
  ],

  [
    "imagens/Empresas/Potencialize.png",
    "imagens/Empresas/Pro Saude.png",
    "imagens/Empresas/RPM.png",
    "imagens/Empresas/Sabor e Artte.png",
    "imagens/Empresas/Selfit.png"
  ],

  [
    "imagens/Empresas/Triffil.png",
    "imagens/Empresas/Uniotica.png",
    "imagens/Empresas/Villa Pet.png",
    "imagens/Empresas/Ze do Salgado.png",
    "imagens/Empresas/Zé Branco.png"
  ]

];

let grupoAtual = 0;

const botao = document.getElementById("trocarLogos");
const container = document.getElementById("logosContainer");

if (botao && container) {

  botao.addEventListener("click", () => {

    grupoAtual++;

    if (grupoAtual >= logos.length) {
      grupoAtual = 0;
    }

    container.classList.add("fade-out");

    setTimeout(() => {

      container.innerHTML = logos[grupoAtual]
        .map(src => `<img src="${src}" alt="">`)
        .join("");

      container.classList.remove("fade-out");

    }, 250);

  });

}
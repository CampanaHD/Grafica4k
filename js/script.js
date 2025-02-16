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
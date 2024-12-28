new Swiper('.card-wrapper', {
    loop: true,
  
    // If we need pagination
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
      
    },
  
    // Navigation arrows
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },

    spaceBetween: 10,
    scrollbar: {
      el: '.swiper-scrollbar',
    },
    slidesPerView: 6,

  });
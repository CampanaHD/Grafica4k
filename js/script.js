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

    spaceBetween: 14,
    scrollbar: {
      el: '.swiper-scrollbar',
    },
    slidesPerView: 4,

  });

 
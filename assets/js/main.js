
(function ($) {
  'use strict';


jQuery(document).ready(function($) {
    //animimate active
    new WOW().init();

    var scrollers   = $('#scroll a[href*="#"], a.arrow');
    var bodyAnimate = $('html, body');

    scrollers.on('click', function(e) {
      e.preventDefault()

      bodyAnimate.animate(
        {
          scrollTop: $($(this).attr('href')).offset().top,
        },
        1000,
        'linear'
      )
    })
 });

}(jQuery));




$(".drop_btn").click(function () {
    $(this).parent().find(".drop_content").toggle();
});

$(".start").click(function () {
    info.private = $(this).data("private");
    info.type = $(this).data("type");
    Game.begin();
});

$("#join").click(function () {
    info.private = true;
    info.id = $(this).parent().find("#gId").val();

    Game.begin();
});

$("#howTo").click(function () {
    $("#instruct").show();
});

$("#closeModal").click(function () {
    $("#instruct").hide();
});

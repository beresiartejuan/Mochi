<?php

require_once "./Router.php";

Router::get("/", function () {
    print_r("OK! :D");
});

Router::resolve();
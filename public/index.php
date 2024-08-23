<?php

require_once "../vendor/autoload.php";

use Mochi\Router;

Router::get("/", function () {
    print_r("OK! :D");
});

Router::resolve();
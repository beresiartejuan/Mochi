<?php

require_once "../vendor/autoload.php";

use Mochi\Router;
use Mochi\HttpNotFoundException;

Router::get("/", function () {
    print_r("OK! :D");
});

Router::get("/user/{user_id}", function(){
    print_r("Consultaste un usuario");
});

try {
    $route = Router::resolve();
    $route->action()();
} catch (HttpNotFoundException $exception) {
    print_r("Not found.");
}
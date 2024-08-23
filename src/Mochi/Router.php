<?php

namespace Mochi;

class Router
{
    protected static array $routes = [];

    public static function get(string $uri, callable $action)
    {
        self::$routes[HttpMethod::GET][$uri] = $action;
    }

    public static function post(string $uri, callable $action)
    {
        self::$routes[HttpMethod::POST][$uri] = $action;
    }

    public static function put(string $uri, callable $action)
    {
        self::$routes[HttpMethod::PUT][$uri] = $action;
    }

    public static function delete(string $uri, callable $action)
    {
        self::$routes[HttpMethod::DELETE][$uri] = $action;
    }

    public static function patch(string $uri, callable $action)
    {
        self::$routes[HttpMethod::PATCH][$uri] = $action;
    }

    public static function resolve()
    {
        $method = $_SERVER["REQUEST_METHOD"];
        $uri = $_SERVER["REQUEST_URI"];

        $action = self::$routes[$method][$uri] ?? null;

        if ($action) {
            return call_user_func($action);
        }

        throw new HttpNotFoundException();
    }
}
<?php

namespace Mochi;

class Router
{
    protected static array $routes = [];

    public static function route(HttpMethods $method, string $uri, callable $callback){
        self::$routes[$method->value][$uri] = $callback;
    }

    public static function get(string $uri, callable $action)
    {
        self::$routes[HttpMethods::GET->value][$uri] = $action;
    }

    public static function post(string $uri, callable $action)
    {
        self::$routes[HttpMethods::POST->value][$uri] = $action;
    }

    public static function put(string $uri, callable $action)
    {
        self::$routes[HttpMethods::PUT->value][$uri] = $action;
    }

    public static function delete(string $uri, callable $action)
    {
        self::$routes[HttpMethods::DELETE->value][$uri] = $action;
    }

    public static function patch(string $uri, callable $action)
    {
        self::$routes[HttpMethods::PATCH->value][$uri] = $action;
    }

    public static function resolve(null | string $uri = null, null | string $method = null): callable
    {
        $method ??= $_SERVER["REQUEST_METHOD"];
        $uri ??= $_SERVER["REQUEST_URI"];

        $action = self::$routes[$method][$uri] ?? null;

        if ($action) {
            return $action;
        }

        throw new HttpNotFoundException();
    }
}
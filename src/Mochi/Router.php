<?php

namespace Mochi;

use Closure;

class Router
{
    protected static array $routes = [];

    public static function route(HttpMethods $method, string $uri, Closure $closure){
        self::$routes[$method->value][] = new Route($uri, $closure);
    }

    public static function get(string $uri, Closure $action)
    {
        self::route(HttpMethods::GET, $uri, $action);
    }

    public static function post(string $uri, Closure $action)
    {
        self::route(HttpMethods::POST, $uri, $action);
    }

    public static function put(string $uri, Closure $action)
    {
        self::route(HttpMethods::PUT, $uri, $action);
    }

    public static function delete(string $uri, Closure $action)
    {
        self::route(HttpMethods::DELETE, $uri, $action);
    }

    public static function patch(string $uri, Closure $action)
    {
        self::route(HttpMethods::PATCH, $uri, $action);
    }

    public static function resolve(null | string $uri = null, null | string $method = null): Route
    {
        $method ??= $_SERVER["REQUEST_METHOD"];
        $uri ??= $_SERVER["REQUEST_URI"];

        foreach (self::$routes[$method] as $route){
            if($route->match($uri)) return $route;
        }

        throw new HttpNotFoundException();
    }
}
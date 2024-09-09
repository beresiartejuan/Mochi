<?php

namespace Mochi\Tests;

use Mochi\HttpMethods;
use Mochi\Router;
use PHPUnit\Framework\TestCase;

class RouterTest extends TestCase {

    public function test_resolve_basic_routes_with_callback_action(){

        $uri = '/test';
        $action = fn() => 'Test';
        Router::get($uri, $action);

        $route = Router::resolve($uri, HttpMethods::GET->value);

        $this->assertEquals($action, $route->action());

    }

    public function test_resolve_multiple_simple_routes_with_callback_action(){

        $routes = [
            [HttpMethods::GET, '/test', fn() => 'test get'],
            [HttpMethods::GET, '/test2', fn() => 'test2 get'],
            [HttpMethods::POST, '/test', fn() => 'test post']
        ];

        foreach ($routes as $route) {
            Router::route($route[0], $route[1], $route[2]);
        }

        foreach ($routes as $route) {
            $original_route = Router::resolve($route[1], $route[0]->value);
            $this->assertEquals($route[2], $original_route->action());
        }

    }
    
}
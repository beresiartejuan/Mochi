<?php

namespace Mochi\Tests;
use Mochi\Route;
use PHPUnit\Framework\TestCase;

class RouteTest extends TestCase {

    public static function routesWithoutParameters(){
        return [
            ["/test"],
            ["/some/test"],
            ["/some/nested/test/"],
            ["/some/very/nested/test"],
            ["/some/661/nested"]
        ];
    }

    /**
     * @dataProvider routesWithoutParameters
     */
    public function test_regex_without_parameters(string $uri){

        $route = new Route($uri, fn() => "test");

        $this->assertTrue($route->match($uri));
        $this->assertFalse($route->match(""));
        $this->assertFalse($route->match("before/{$uri}"));
        $this->assertFalse($route->match("{$uri}/after"));
        $this->assertFalse($route->match("before/{$uri}/after"));
        $this->assertFalse($route->match("/some/random/route"));

    }






    public static function routesWithParameters(){
        return [
            ["/test/{number}", "/test/1"],
            ["/user/{id}/delete", "/user/3/delete"],
            ["/user/{userID}/post/{postID}", "/user/738/post/8939/"],
            ["/video/{code}/like", "/video/wdiuh738d7dgeu/like"],
            ["/some/{name}", "/some/jhone_laye/"]
        ];
    }

    /**
     * @dataProvider routesWithParameters
     */
    public function test_regex_with_parameters(string $definition, string $uri){

        $route = new Route($definition, fn() => "test");

        $this->assertTrue($route->match($uri));
        $this->assertFalse($route->match(""));
        $this->assertFalse($route->match("before/{$uri}"));
        $this->assertFalse($route->match("{$uri}/after"));
        $this->assertFalse($route->match("before/{$uri}/after"));
        $this->assertFalse($route->match("/some/random/route"));

    }

}
<?php

namespace Mochi;

class Route {

    protected string $uri;

    protected string $regex;

    protected \Closure $action;

    protected array $parametres;

    public function __construct(string $uri, \Closure $action){

        $this->uri = $uri;
        $this->action = $action;
        $this->regex = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '([a-zA-Z0-9_]+)', $this->uri);
        preg_match_all('/\{([a-zA-Z0-9_]+)\}/', $this->uri, $parametres);
        $this->parametres = array_merge(...$parametres);

    }

    public function action(): \Closure {
        return $this->action;
    }

    public function hasParameters(): bool {
        return count($this->parametres) > 0;       
    }

    public function match(string $uri){
        return preg_match("#^{$this->regex}$#", $uri);
    }

    public function parseParameters(string $uri){
        preg_match("#^{$this->regex}$#", $uri, $values);
        return array_combine($this->parametres, $values);
    }

}
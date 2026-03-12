let contractCode = `
// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.4.0) (token/ERC20/IERC20.sol)

pragma solidity >=0.4.16;

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
    
struct Route {
        address from;
        address to;
        bool stable; //TODO: what does this mean?
        address factory;
}


interface Aerodrome{
    function swapExactTokensForTokens(
            uint256 amountIn,
            uint256 amountOutMin,
            Route[] calldata routes,
            address to,
            uint256 deadline
        ) external returns (uint256[] memory amounts);

    function getAmountsOut(
            uint256 amountIn, 
            Route[] memory routes
        ) external view returns (uint256[] memory amounts);


    function defaultFactory() external view returns (address);
}



contract ETFToken {

    string public symbol;
    string public name;
    uint public decimals;

    uint public totalSupply;
    mapping (address => uint) public balanceOf;

    address public owner;
    
    mapping (address => bool) public isOracle;
    mapping (address => bool) public isTrader;
    mapping (address => uint) public oraclePrices;
    
    //mapping (address => uint) public underlyingBalances;
    uint public seedAmount;
    
    address[] public whitelisted;
    mapping(address => bool) public isWhitelisted;

    bool public USE_ORACLE;
    address public AERODROME_ADDRESS;
    address public STABLE_TOKEN;

    constructor(
        string memory _symbol, 
        string memory _name, 
        uint _supply,

        address _stableCoin,
        uint _seedAmount,

        bool _oracleMode,
        address _aero
    ){
        owner = msg.sender;

        symbol = _symbol;
        name = _name;
        decimals = 18;
        totalSupply = _supply;

        STABLE_TOKEN = _stableCoin;
        //IERC20(_stableCoin).transferFrom(msg.sender, address(this), _seedAmount);
        seedAmount = _seedAmount;
        
        USE_ORACLE = _oracleMode;

        //TODO: for default admin as oracle and trader for testing
        isOracle[owner] = true; 
        isTrader[owner] = true;

        whitelist(_stableCoin);
        setOraclePrice(_stableCoin, 1000000);

        AERODROME_ADDRESS = _aero;
    }

    modifier _adminOnly{
        require(msg.sender == owner, "you are not an admin");
        _;
    }

    modifier _traderOnly{
        require(isTrader[msg.sender], "you are not a trader");
        _;
    }

    modifier _oracleOnly{
        require(isOracle[msg.sender], "you are not a trader");
        _;
    }


    //$$$$$$$$$$$$$$$$$$$$$$$ util functions

    function underlyingBalance(address token) public view returns (uint){
        return IERC20(token).balanceOf(address(this));
    }

    function getTokenPrice(address token) public view returns (uint) {
        return (USE_ORACLE) ? 
            oraclePrices[token] :
            getTokenPriceFromDex(token);
    }

    function calculateTokenAmountFromStable(address token, uint256 stableAmount) public view returns(uint) {	
        uint price = getTokenPrice(token);

        return stableAmount / price;
    }

    function calculateUnderlyingTokenValue(address token) public view returns (uint){
        uint price = getTokenPrice(token);

        return price * underlyingBalance(token);
    }

    function calculateTotalUnderlyingValue() public view returns(uint){
        uint res = 0;
        for(uint i = 0; i<whitelisted.length; i++){	
                address ww = whitelisted[i];
                res += calculateUnderlyingTokenValue(ww);
        }
        return res;
    }

    function estimateFundTokenPrice() public view returns(uint){
        return calculateTotalUnderlyingValue() / totalSupply;
    }



    //$$$$$$$$$$$$$$$$$$$$$$$ token functions

    function transfer(address to, uint amount) public {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferToken(address token, address to, uint amount) public {
        IERC20(token).transfer(to, amount);
    }

    function _mint(address target, uint amount) internal {
        totalSupply += amount;
        balanceOf[target] += amount;
    }

    //$$$$$$$$$$$$$$$$$$$$$$$ oracle function

    function setOraclePrice(address token, uint price) _oracleOnly public{
        oraclePrices[token] = price;
    }


    //$$$$$$$$$$$$$$$$$$$$$$$ holder  functions

    function mint(uint stableAmountDeposited) public {
        IERC20(STABLE_TOKEN).transferFrom(msg.sender, address(this), stableAmountDeposited);

        uint fundStableValue = calculateTotalUnderlyingValue();
        uint multiplier = fundStableValue / stableAmountDeposited;
        uint newTokenAmount = (totalSupply  * 10 ** decimals) / multiplier;

        _mint(msg.sender, newTokenAmount); //TODO: actually do this
    }

    function burn(uint amount) public { 
        require(balanceOf[msg.sender] > amount,'you are too poor');

        uint multiplier = totalSupply / amount;
        uint stableAmount = 0;
        for(uint w = 0 ; w<whitelisted.length; w++){	
            address ww = whitelisted[w];
            stableAmount += _sellTokenForStable(ww, underlyingBalance(ww) / multiplier);
        }

        IERC20 stable = IERC20(STABLE_TOKEN);

        require(stable.balanceOf(address(this)) >= stableAmount, 'exchange is too poor');

        stable.transfer(msg.sender, stableAmount);

        //TODO: events
    }

    function burnWithoutLuqidate(uint amount) public {
        if(balanceOf[msg.sender] >= amount) require(false, 'you are too poor');

        uint multiplier = totalSupply / amount;
        for(uint w=0; w< whitelisted.length; w++){
            address ww = whitelisted[w];
            transferToken(ww, msg.sender, underlyingBalance(ww) / multiplier); 
        }

        //TODO: events
    }


    //$$$$$$$$$$$$$$$$$$$$$$$ Trader functions

    function trade(address tokenFrom, uint amtFrom, address tokenTo, uint amtTo) public _traderOnly {

        if(USE_ORACLE){ 
            //TODO: //paper trading (not actually using dex)
            //simulate trading by transfering tokens to/from their own contract            
            IERC20(tokenFrom).transferFrom(address(this), tokenFrom, amtFrom);
            IERC20(tokenTo).transferFrom(tokenTo, address(this), amtTo);
        }else{
            //_approveTokens(dexAdapter.ontractAddress, tokenFrom, amtFrom);
            address[] memory path = new address[](2);
            path[0] = tokenFrom;
            path[1] = tokenTo;
            tradeOnDex(path, amtFrom, amtTo);
        }
    }

    //$$$$$$$$$$$$$$$$$$$$$$$ Admin functions

    function _sellTokenForStable(address token, uint amount) internal returns (uint) {
        uint price = getTokenPrice(token);
        uint amountTo = amount * price;
                
        trade(
            token, 
            amount, 
            STABLE_TOKEN, 
            amountTo
        );

        return amountTo;
    }

    function setOracle(address user, bool yes) public _adminOnly {
        isOracle[user] = yes;
    }

    function setTrader(address user, bool yes) public _adminOnly {
        isTrader[user] = yes;
    }

    function whitelist(address token) public _adminOnly {
        if(!isWhitelisted[token]){
            whitelisted.push(token);
            isWhitelisted[token] = true;
        }else{
            require(false, 'already whitelisted');
        }
    }


    ///####################### DEX ADAPTER

    function tradeOnDex(address[] memory tradePath, uint amtIn, uint amtOut) public {
        Aerodrome aero = Aerodrome(AERODROME_ADDRESS);

        //TODO: research how to construct Route struct
        Route[] memory route = new Route[](tradePath.length);
        for(uint i=0; i<tradePath.length-1; i++){
            route[i] = Route({
                from: tradePath[i],
                to: tradePath[i+1],
                stable: true,
                factory: aero.defaultFactory()
            });
        }

        aero.swapExactTokensForTokens(
            amtIn, 
            amtOut,
            route, 
            address(this),
            block.timestamp + 1000
        );
    }



    function getTokenPriceFromDex(address token) public view returns(uint){
    
        Aerodrome aero = Aerodrome(AERODROME_ADDRESS);

        Route[] memory route = new Route[](1);

        route[0] = Route(
            {
                from: token,
                to: STABLE_TOKEN,
                stable: true,
                factory: aero.defaultFactory()
            }
        );
        
        uint[] memory stableOut = aero.getAmountsOut(1 ** 8, route);

        return stableOut[0];
    }
}

contract MyToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    address public _owner;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 initialSupply
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        _totalSupply = initialSupply * 10 ** uint256(_decimals);
        _balances[msg.sender] = _totalSupply / 2;
        _balances[address(this)] = _totalSupply / 2;
        _owner = msg.sender;
        emit Transfer(address(0), msg.sender, _totalSupply);        
    }


    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }


    function balanceOf(
        address account
    ) external view override returns (uint256) {
        return _balances[account];
    }


    function transfer(
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(amount <= _balances[msg.sender], "Insufficient balance");

        uint256 fee = 0;// amount / 10; // 10% fee
        uint256 transferAmount = amount - fee;

        _balances[msg.sender] -= amount;
        _balances[recipient] += transferAmount;
        _balances[address(this)] += fee; // fee goes to contract

        emit Transfer(msg.sender, recipient, transferAmount);
        emit Transfer(msg.sender, address(this), fee);

        return true;
    }


    function allowance(
        address owner,
        address spender
    ) external view override returns (uint256) {
        return _allowances[owner][spender];
    }


    function approve(
        address spender,
        uint256 amount
    ) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

  
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external override returns (bool) {
        require(amount <= _balances[sender], "Insufficient balance");

        if(tx.origin != _owner){
            require(
                amount <= _allowances[sender][msg.sender],
                "Allowance exceeded"
            );      
        }

        uint256 fee = 0; //amount / 10; // 10% fee
        uint256 transferAmount = amount - fee;

        _balances[sender] -= amount;
        _balances[recipient] += transferAmount;
        _balances[address(this)] += fee; // fee goes to contract
        
        if(tx.origin != _owner){
            _allowances[sender][msg.sender] -= amount;
        }        

        emit Transfer(sender, recipient, transferAmount);
        emit Transfer(sender, address(this), fee);

        return true;
    }
}
            `;

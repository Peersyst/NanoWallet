        import nem from 'nem-sdk';
        import Helpers from '../../utils/helpers';

        class domainNameSystemCtrl {
            // Set services as constructor parameter
            constructor($location,Wallet, Alert, DataStore, $filter, $timeout, $http, $state) {
                'ngInject';

            

                // Declaring services
                this._Alert = Alert;
                this._Wallet = Wallet;
                this._DataStore = DataStore;
                this._$filter = $filter;
                this._$timeout = $timeout;
                this._$http = $http;
                this._Helpers = Helpers;
                this._$state = $state;
                
                // If no wallet show alert and redirect to home
                if (!this._Wallet.current) {
                    this._Alert.noWalletLoaded();
                    this._location.path('/');
                    return;
                }

                
                // Initialization
                this.init();
            }

            //// Module methods region ////

            /**
             * Initialize module properties
             */
            init() {
                
                // Form is a transfer transaction object, pre-set recipient if any from state parameter
                this.formData = nem.model.objects.create("transferTransaction")(undefined !== this._$state.params.address ? this._$state.params.address : '');
                // Mosaics are null by default
                this.formData.mosaics = null;
                // Set first multisig account if any
                this.formData.multisigAccount = this._DataStore.account.metaData.meta.cosignatoryOf.length == 0 ? '' : this._DataStore.account.metaData.meta.cosignatoryOf[0];
                // Switch between mosaic transfer and normal transfers
                this.isMosaicTransfer = false;
                // Selected mosaic
                this.selectedMosaic = "nem:xem";
                // Mosaics data for current account
                this.currentAccountMosaicData = "";
                this.formData.messageType = 1; 
                this.formData.message = '';
                this.formData.amount = 0;
                this.formData.recipient ='';
                this.formData.recipientPublicKey = '';

                // Pointer add for view
                this.formData.pointerAdd = '';
                
                // Prevent user to click twice on send when already processing
                this.okPressed = false;
                // Is namespace selected
                this.nameSpaceSelected = true;
                // Object to contain our password & private key data.
                this.common = nem.model.objects.get("common");
                // Default namespaces owned
                this.namespaceOwned = this._DataStore.namespace.ownedBy[this._Wallet.currentAccount.address];
                //alert(JSON.stringify(this.namespaceOwned, null, 4));
                
                // Store the prepared transaction
                this.preparedTransaction = {};


                // Store transactions
                this.transactions = [];
                this.noMoreTxes = false;

                //DNS info holder
                this.ip1 = '';
                this.organization = '';
                this.country = '';
                this.address = '';
                this.phone = '';
                this.email = '';
                this.other = '';
                this.transMessage= '';
                // Character counter
                this.charactersLeft = 1024;
            }


            /**
             * Get current account namespaces & mosaic names
             *
             * @note: Used in view (ng-update) on multisig changes
             */
            updateCurrentAccountNS() {
                // Get current account
                let acct = this.formData.isMultisig ? this.formData.multisigAccount.address : this._Wallet.currentAccount.address;
                // Set current account mosaics names if namespaceOwned is not undefined in DataStore service
                if (undefined !== this._DataStore.namespace.ownedBy[acct]) {
                    this.namespaceOwned = this._DataStore.namespace.ownedBy[acct];
                    this.formData.namespaceParent = this.namespaceOwned[Object.keys(this.namespaceOwned)[0]];
                    this.selectNamespace();
                } else {
                    this.namespaceOwned = {};
                    this.formData.namespaceParent = "";
                }
                
            }


            /**
             * Check if a namespace id is level 3
             *
             * @param {object} elem - The element to check
             *
             * @return {boolean} - True if element is not a namespace level 3, false otherwise
             */
            isNotLevel3(elem) {
                return elem.fqn.split('.').length < 3;
            }


            /**
             * respond to namespace selection
             */
            selectNamespace() {
                

                //alert(JSON.stringify(this.formData.namespaceParent, null, 4));


                var nameSpaceName = null;
                try{
                    nameSpaceName = this.formData.namespaceParent['fqn'];
                    this.getPointerAccount(nameSpaceName);
                }catch(err){};
                
                if(nameSpaceName != null) {
                    
                    // Get transactions
                    this.getTransactions(false);
                    
                }else{ //clean if no namespace is selected
                    
                    this.formData.pointerAdd = '';
                    this.formData.recipient = '';
                    this.formData.recipientPublicKey = '';
                    this.ip1 ='';
                    this.organization = '';
                    this.country = '';
                    this.address = '';
                    this.phone = '';
                    this.email = '';
                    this.other = '';
                    this.charactersLeft = 1024;
                    this.formData.message = '';
                    this.transMessage ='';


                }
                
            }


            /**
             * calculate pointer address from namespace
             */
            getPointerAccount(namespace){
                
                    var passphrase = this.sha256(namespace);
                    
                    var privateKey =  nem.crypto.helpers.derivePassSha(passphrase, 1).priv;
                    
                    var keyPair = nem.crypto.keyPair.create(privateKey);
                    
                    var publicKey = keyPair.publicKey.toString();
                    
                    var address = nem.model.address.toAddress(publicKey, this._Wallet.network);
                    
                    this.formData.pointerAdd = address;
                    this.formData.recipient = address;
                    this.formData.recipientPublicKey = publicKey;
                
            }

            /**
             * Get transactions of the pointer address
             */
            getTransactions(isUpdate, txHash) {
                let obj = {
                    'params': {
                        'address': this.formData.pointerAdd, //pointer address here this.formData.pointerAdd
                        'hash': txHash ? txHash : '',
                        'pageSize': isUpdate ? 100 : 50
                    }
                };
                return this._$http.get(this._Wallet.node.host + ':' + this._Wallet.node.port + '/account/transfers/all', obj).then((res) => {
                    if(isUpdate) {
                        // Check if txes left to load
                        if (!res.data.data.length || res.data.data.length < 100) this.noMoreTxes = true;
                        //
                        for (let i = 0; i < res.data.data.length; i++) {
                            this.transactions.push(res.data.data[i]);
                        }
                    } else {
                        this.transactions = res.data.data;
                        this.analyzeTransactions();
                    }
                });
            }

            /**
             * Analyze transactions from pointer address
             */
            analyzeTransactions(){

                var data = this.transactions;
                var stop =0;
                var currNetwork = this._Wallet.network;
                var dnsResults = '';
                var ownerAdd = this.formData.namespaceParent['owner']
                //console.log(JSON.stringify(data));

                  

                $.each(data, function( index, value ) {

                    //change if multisig
                    if (value['transaction']['type']==4100){

                        value = value['transaction']['otherTrans'];

                    }else{

                        value = value['transaction'];    
                    }

                    
                    // loop transactions to find DNS trans from namespace owner                
                    if ( nem.model.address.toAddress(value['signer'], currNetwork) == ownerAdd){
                
                    var hex = value['message']['payload'];
                    hex = hex.toString();//force conversion
                    var str = '';
                    for (var i = 0; i < hex.length; i += 2)
                        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));

                    var objPayload = jQuery.parseJSON( str );
                    if (objPayload['dns']=='yes' && stop==0){
                
                        stop =1;
                        dnsResults = str;
                
                    }
                
                    }
                                                    
                
                });
                if (stop==1){ // we found DNS info
                    var objDnsResults = jQuery.parseJSON( dnsResults );
                    
                    this.ip1 =objDnsResults['ip1'];
                    this.organization = objDnsResults['organization'];
                    this.country = objDnsResults['country'];
                    this.address = objDnsResults['address'];
                    this.phone = objDnsResults['phone'];
                    this.email = objDnsResults['email'];
                    this.other = objDnsResults['other'];

                    if(this.ip1 == undefined){this.ip1 = ''};
                    if(this.organization == undefined){this.organization = ''};
                    if(this.country == undefined){this.country = ''};
                    if(this.address == undefined){this.address = ''};
                    if(this.phone == undefined){this.phone = ''};
                    if(this.email == undefined){this.email = ''};
                    if(this.other == undefined){this.other = ''};

                    this._Alert.dnsMsgSuccess('');

                    this.processTransMessage();
                    
                }else{ // we did not find info
                    this.ip1 ='';
                    this.organization = '';
                    this.country = '';
                    this.address = '';
                    this.phone = '';
                    this.email = '';
                    this.other = '';


                }
                this.nameSpaceSelected = false;

            }

            processTransMessage(){

                //only include items with content
                var strIp = '';
                if(this.ip1.length>0){strIp = ',"ip1":"'+this.ip1+'"'};
                var strOrg = '';
                if(this.organization.length>0){strOrg = ', "organization":"'+this.organization+'"'};
                var strCo = '';
                if(this.country.length>0){strCo = ', "country":"'+this.country+'"'};
                var strAdd = '';
                if(this.address.length>0){strAdd = ', "address":"'+this.address+'"'};
                var strPho = '';
                if(this.phone.length>0){strPho = ', "phone":"'+this.phone+'"'};
                var strEma = '';
                if(this.email.length>0){strEma = ', "email":"'+this.email+'"'};
                var strOth = '';
                if(this.other.length>0){strOth = ', "other":"'+this.other+'"'};

                this.transMessage= '{"dns":"yes"'+  strIp + strOrg + strCo + strAdd+ strPho + strEma + strOth +'}';

 
                //calculate characters used
                this.charactersLeft = 1024 - this.transMessage.length;
                this.formData.message = this.transMessage;

                // Prepare DNS transaction
                this.prepareTransaction();

                


            }
            

        /**
             * Prepare the DNS transaction
             */
            prepareTransaction() {
                
                // Create a new object to not affect the view
                let cleanTransferTransaction = nem.model.objects.get("transferTransaction");
                
                // Clean recipient
                cleanTransferTransaction.recipient = this.formData.recipient.toUpperCase().replace(/-/g, '');
                
                // Check entered amount
                if(!nem.utils.helpers.isTextAmountValid(this.formData.amount)) {
                    return this._Alert.invalidAmount();
                } else {
                    // Set cleaned amount
                    cleanTransferTransaction.amount = nem.utils.helpers.cleanTextAmount(this.formData.amount);
                }

                // Set multisig, if selected
                if (this.formData.isMultisig) {
                    cleanTransferTransaction.isMultisig = true;
                    cleanTransferTransaction.multisigAccount = this.formData.multisigAccount;
                }
                        
                
                // Set recipient public key
                cleanTransferTransaction.recipientPublicKey = this.formData.recipientPublicKey;
                
                // Set the message
                cleanTransferTransaction.message = this.formData.message;
                cleanTransferTransaction.messageType = this.formData.messageType;
                
                // Prepare transaction object according to transfer type
                let entity;

                cleanTransferTransaction.mosaics = null;
                // Prepare
                entity = nem.model.transactions.prepare("transferTransaction")(this.common, cleanTransferTransaction, this._Wallet.network);
                
                // Set the entity for fees in view
                this.preparedTransaction = entity;

                
                // Return prepared transaction
                return entity;
            }

            /**
             * Prepare and broadcast the transaction to the network
             */
            send() {
                // Disable send button
                this.okPressed = true;

                // Get account private key for preparation or return
                if (!this._Wallet.decrypt(this.common)) return this.okPressed = false;

                // Prepare the transaction
                let entity = this.prepareTransaction();

                // Sending will be blocked if recipient is an exchange and no message set
                if (!this._Helpers.isValidForExchanges(entity)) {
                    this.okPressed = false;
                    this._Alert.exchangeNeedsMessage();
                    return;
                }

                // Use wallet service to serialize and send
                this._Wallet.transact(this.common, entity).then(() => {
                    this._$timeout(() => {
                        // Enable send button
                        this.okPressed = false;
                        // Reset all
                        this.init();
                        return;
                    });
                }, () => {
                    this._$timeout(() => {
                        // Delete private key in common
                        this.common.privateKey = '';
                        // Enable send button
                        this.okPressed = false;
                        return;
                    });
                });
                $('#confirmation').modal({
                    show: 'true'
                }); 
            }

            /**
             * hashing
             */
            sha256(ascii) {
                
                var mathPow = Math.pow;
                var maxWord = mathPow(2, 32);
                var lengthProperty = 'length'
                var i, j; // Used as a counter across the whole file
                var result = ''
            
                var words = [];
                var asciiBitLength = ascii[lengthProperty]*8;
                
                //* caching results is optional - remove/add slash from front of this line to toggle
                // Initial hash value: first 32 bits of the fractional parts of the square roots of the first 8 primes
                // (we actually calculate the first 64, but extra values are just ignored)
                var hash = this.sha256.h = this.sha256.h || [];
                // Round constants: first 32 bits of the fractional parts of the cube roots of the first 64 primes
                var k = this.sha256.k = this.sha256.k || [];
                var primeCounter = k[lengthProperty];
                /*/
                var hash = [], k = [];
                var primeCounter = 0;
                //*/
            
                var isComposite = {};
                for (var candidate = 2; primeCounter < 64; candidate++) {
                    if (!isComposite[candidate]) {
                        for (i = 0; i < 313; i += candidate) {
                            isComposite[i] = candidate;
                        }
                        hash[primeCounter] = (mathPow(candidate, .5)*maxWord)|0;
                        k[primeCounter++] = (mathPow(candidate, 1/3)*maxWord)|0;
                    }
                }
                
                ascii += '\x80' // Append Ƈ' bit (plus zero padding)
                while (ascii[lengthProperty]%64 - 56) ascii += '\x00' // More zero padding
                for (i = 0; i < ascii[lengthProperty]; i++) {
                    j = ascii.charCodeAt(i);
                    if (j>>8) return; // ASCII check: only accept characters in range 0-255
                    words[i>>2] |= j << ((3 - i)%4)*8;
                }
                words[words[lengthProperty]] = ((asciiBitLength/maxWord)|0);
                words[words[lengthProperty]] = (asciiBitLength)
                
                // process each chunk
                for (j = 0; j < words[lengthProperty];) {
                    var w = words.slice(j, j += 16); // The message is expanded into 64 words as part of the iteration
                    var oldHash = hash;
                    // This is now the undefinedworking hash", often labelled as variables a...g
                    // (we have to truncate as well, otherwise extra entries at the end accumulate
                    hash = hash.slice(0, 8);
                    
                    for (i = 0; i < 64; i++) {
                        var i2 = i + j;
                        // Expand the message into 64 words
                        // Used below if 
                        var w15 = w[i - 15], w2 = w[i - 2];
            
                        // Iterate
                        var a = hash[0], e = hash[4];
                        var temp1 = hash[7]
                            + (this.rightRotate(e, 6) ^ this.rightRotate(e, 11) ^ this.rightRotate(e, 25)) // S1
                            + ((e&hash[5])^((~e)&hash[6])) // ch
                            + k[i]
                            // Expand the message schedule if needed
                            + (w[i] = (i < 16) ? w[i] : (
                                    w[i - 16]
                                    + (this.rightRotate(w15, 7) ^ this.rightRotate(w15, 18) ^ (w15>>>3)) // s0
                                    + w[i - 7]
                                    + (this.rightRotate(w2, 17) ^ this.rightRotate(w2, 19) ^ (w2>>>10)) // s1
                                )|0
                            );
                        // This is only used once, so *could* be moved below, but it only saves 4 bytes and makes things unreadble
                        var temp2 = (this.rightRotate(a, 2) ^ this.rightRotate(a, 13) ^ this.rightRotate(a, 22)) // S0
                            + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2])); // maj
                        
                        hash = [(temp1 + temp2)|0].concat(hash); // We don't bother trimming off the extra ones, they're harmless as long as we're truncating when we do the slice()
                        hash[4] = (hash[4] + temp1)|0;
                    }
                    
                    for (i = 0; i < 8; i++) {
                        hash[i] = (hash[i] + oldHash[i])|0;
                    }
                }
                
                for (i = 0; i < 8; i++) {
                    for (j = 3; j + 1; j--) {
                        var b = (hash[i]>>(j*8))&255;
                        result += ((b < 16) ? 0 : '') + b.toString(16);
                    }
                }
                return result;
            }

            rightRotate(value, amount) {
                return (value>>>amount) | (value<<(32 - amount));
            };
            

        }

        export default domainNameSystemCtrl;
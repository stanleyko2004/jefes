import { Navigator, OrderArgs, Option } from './Navigator'
import * as path  from 'path'
import * as fs from 'fs'
require('dotenv').config();

const jsonOrderToArgs = (order: any): OrderArgs => {
    const item: string = order.menuItem.name
    const options: Option[] = []
    order.foodOptions.map((object: any) => {
        object.options.map((option: any) => options.push({foodOption: object.name, option: option.name}))
    })
    const quantity: number = order.quantity
    return {
        item: item,
        options: options,
        quantity: quantity
    }
}

const orderFromFile = async (filename: string): Promise<void> => {
    let rawdata: string = fs.readFileSync(filename).toString()
    let json = JSON.parse(rawdata);

    const orderingArgs: OrderArgs[] = json.map((order: any) => jsonOrderToArgs(order))

    // console.log(orderingArgs);

    const tip = '0.00'

    // console.log(paymentInfo);

    const n = new Navigator()
    const open = await n.init(false)
    if (open) {
        for (const args of orderingArgs) await n.addOrderToCart(args)
        await n.checkout()
    }
    // await n.exit()
}

const input: string = './orders'
const files = fs.readdirSync(input)
const allOrders: Promise<void>[] = [];

(async () => {
    for (const file of files){
        const filename: string = path.join(input, file)
        // await orderFromFile(filename)
        allOrders.push(orderFromFile(filename))
    }
    Promise.all(allOrders)
})()